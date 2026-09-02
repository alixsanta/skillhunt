import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { hash, verify, Algorithm } from '@node-rs/argon2';
import { User } from '../users/user.entity';
import { RegisterDto, LoginDto, SELF_ASSIGNABLE_ROLES } from './dto/register.dto';
import { JwtPayload } from './guards/jwt-auth.guard';
import { TokenStore } from './token-store.service';
import { TwoFactorService } from './two-factor.service';

// Vue publique d'un utilisateur : ne contient JAMAIS le hash du mot de passe ni les
// champs 2FA (secret chiffré, codes de secours) — anti-fuite (SH-40, §8)
export type PublicUser = Omit<
  User,
  'passwordHash' | 'twoFactorSecretEncrypted' | 'twoFactorBackupCodesHashed'
>;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * Étape intermédiaire du login quand la 2FA est active (SH-40) : AUCUN token de session
 * n'est émis — seul un jeton d'étape courte durée identifie la connexion en attente.
 */
export interface TwoFactorChallenge {
  twoFactorRequired: true;
  twoFactorToken: string;
}

const ACCESS_TTL = '15m';
const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 jours
// Jeton d'étape 2FA : 5 minutes pour saisir le code (décision 2026-07-16 — JWT dédié,
// type 'twofa_pending', refusé par le JwtAuthGuard qui n'accepte que 'access').
const TWOFA_PENDING_TTL = '5m';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    private readonly jwt: JwtService,
    private readonly tokenStore: TokenStore,
    private readonly twoFactor: TwoFactorService,
  ) {}

  async register(dto: RegisterDto): Promise<PublicUser> {
    // Défense en profondeur : le rôle ADMIN n'est jamais auto-attribuable à l'inscription.
    // Le DTO le bloque déjà (400) ; ce garde couvre aussi les appels internes (anti-élévation de privilèges, OWASP A01).
    if (!SELF_ASSIGNABLE_ROLES.includes(dto.role)) {
      throw new ForbiddenException('Ce rôle ne peut pas être auto-attribué à l\'inscription');
    }

    const existing = await this.usersRepo.findOne({ where: { email: dto.email } });
    if (existing) {
      throw new UnauthorizedException('Cette adresse email est déjà enregistrée');
    }

    // Hachage fort du mot de passe en Argon2id (conformité RGPD / OWASP — C2.2.3)
    const passwordHash = await hash(dto.password, { algorithm: Algorithm.Argon2id });

    // L'identifiant UUID est généré par la base (gen_random_uuid), pas côté application
    const user = this.usersRepo.create({
      email: dto.email,
      username: dto.username,
      role: dto.role,
      passwordHash,
      // SH-34 — position saisie à l'inscription (obligatoire pour un FREELANCE, cf. RegisterDto).
      // ⚠️ Ordre GeoJSON = [longitude, latitude], inverse de l'ordre usuel lat/lon (C2.2.3).
      location: dto.location
        ? { type: 'Point' as const, coordinates: [dto.location.longitude, dto.location.latitude] }
        : null,
    });

    const saved = await this.usersRepo.save(user);
    return this.toPublicUser(saved);
  }

  async login(dto: LoginDto): Promise<TokenPair | TwoFactorChallenge> {
    const user = await this.usersRepo.findOne({ where: { email: dto.email } });

    // Message générique volontaire : ne révèle pas si c'est l'email ou le mot de passe qui est faux
    const invalid = () => new UnauthorizedException('Identifiants ou mot de passe incorrects');

    if (!user) {
      throw invalid();
    }

    const passwordValid = await this.safeVerify(user.passwordHash, dto.password);
    if (!passwordValid) {
      throw invalid();
    }

    // 2FA active (SH-40) : NI access token NI cookie de refresh à ce stade —
    // seulement un jeton d'étape 5 min. L'état 2FA n'est révélé QU'APRÈS un mot de
    // passe valide (anti-énumération, S4).
    if (user.twoFactorEnabled) {
      const twoFactorToken = this.jwt.sign(
        { userId: user.id, type: 'twofa_pending' },
        { expiresIn: TWOFA_PENDING_TTL },
      );
      return { twoFactorRequired: true, twoFactorToken };
    }

    return this.issueTokens(user);
  }

  /**
   * Étape 2 du login (SH-40) : le jeton d'étape + un code TOTP (ou de secours) valide
   * complètent la connexion. Le rate-limiting anti-brute-force vit dans TwoFactorService.
   */
  async completeTwoFactorLogin(twoFactorToken: string, code: string): Promise<TokenPair> {
    let payload: { userId: string; type?: string };
    try {
      payload = this.jwt.verify(twoFactorToken);
    } catch {
      throw new UnauthorizedException('Session 2FA expirée. Reconnecte-toi.');
    }

    // Anti-confusion de type : un access/refresh token complet ne franchit JAMAIS cette étape
    if (payload.type !== 'twofa_pending') {
      throw new UnauthorizedException('Session 2FA expirée. Reconnecte-toi.');
    }

    if (!(await this.twoFactor.verifyCode(payload.userId, code))) {
      throw new UnauthorizedException('Code de vérification invalide');
    }

    const user = await this.usersRepo.findOne({ where: { id: payload.userId } });
    if (!user) {
      throw new UnauthorizedException('Utilisateur introuvable');
    }

    return this.issueTokens(user);
  }

  /**
   * Rotation du refresh token : on vérifie sa signature et sa présence dans le registre,
   * puis on le révoque et on émet un nouveau couple de tokens (C2.2.3).
   */
  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: JwtPayload & { jti?: string; type?: string };
    try {
      payload = this.jwt.verify(refreshToken);
    } catch {
      throw new UnauthorizedException('Refresh token invalide ou expiré');
    }

    if (
      payload.type !== 'refresh' ||
      !payload.jti ||
      !(await this.tokenStore.isValid(payload.jti, payload.userId))
    ) {
      throw new UnauthorizedException('Refresh token révoqué ou inconnu');
    }

    // Rotation : l'ancien jeton ne pourra plus être réutilisé
    await this.tokenStore.revoke(payload.jti);

    const user = await this.usersRepo.findOne({ where: { id: payload.userId } });
    if (!user) {
      throw new UnauthorizedException('Utilisateur introuvable');
    }

    return this.issueTokens(user);
  }

  async logout(refreshToken: string): Promise<{ success: boolean }> {
    try {
      const payload = this.jwt.verify(refreshToken) as JwtPayload & { jti?: string };
      if (payload.jti) {
        await this.tokenStore.revoke(payload.jti);
      }
    } catch {
      // Logout idempotent : un token déjà invalide n'est pas une erreur
    }
    return { success: true };
  }

  private async issueTokens(user: User): Promise<TokenPair> {
    const payload: JwtPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      username: user.username,
    };

    const accessToken = this.jwt.sign(
      { ...payload, type: 'access' },
      { expiresIn: ACCESS_TTL },
    );

    const jti = randomUUID();
    const refreshToken = this.jwt.sign(
      { ...payload, type: 'refresh' },
      { expiresIn: REFRESH_TTL_SECONDS, jwtid: jti },
    );
    await this.tokenStore.save(jti, user.id, REFRESH_TTL_SECONDS);

    return { accessToken, refreshToken };
  }

  // Argon2 lève une erreur si le hash stocké n'est pas un hash Argon2 valide :
  // on neutralise ce cas en renvoyant simplement « mot de passe invalide ».
  private async safeVerify(storedHash: string, password: string): Promise<boolean> {
    try {
      return await verify(storedHash, password);
    } catch {
      return false;
    }
  }

  private toPublicUser(user: User): PublicUser {
    const {
      passwordHash: _passwordHash,
      twoFactorSecretEncrypted: _secret,
      twoFactorBackupCodesHashed: _codes,
      ...publicUser
    } = user;
    void _passwordHash;
    void _secret;
    void _codes;
    return publicUser;
  }
}
