import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { hash, verify, Algorithm } from '@node-rs/argon2';
import { DbState, User } from '../db/db-state';
import { RegisterDto, LoginDto } from './dto/register.dto';
import { JwtPayload } from './guards/jwt-auth.guard';
import { TokenStore } from './token-store.service';

// Vue publique d'un utilisateur : ne contient JAMAIS le hash du mot de passe (anti-fuite)
export type PublicUser = Omit<User, 'passwordHash'>;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

const ACCESS_TTL = '15m';
const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 jours

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DbState,
    private readonly jwt: JwtService,
    private readonly tokenStore: TokenStore,
  ) {}

  async register(dto: RegisterDto): Promise<PublicUser> {
    const users = this.db.users$.getValue();
    if (users.find((u) => u.email === dto.email)) {
      throw new UnauthorizedException('Cette adresse email est déjà enregistrée');
    }

    // Hachage fort du mot de passe en Argon2id (conformité RGPD / OWASP — C2.2.3)
    const passwordHash = await hash(dto.password, { algorithm: Algorithm.Argon2id });

    const newUser: User = {
      id: `usr-${randomUUID()}`,
      email: dto.email,
      username: dto.username,
      role: dto.role,
      passwordHash,
    };

    this.db.users$.next([...users, newUser]);
    return this.toPublicUser(newUser);
  }

  async login(dto: LoginDto): Promise<TokenPair> {
    const user = this.db.users$.getValue().find((u) => u.email === dto.email);

    // Message générique volontaire : ne révèle pas si c'est l'email ou le mot de passe qui est faux
    const invalid = () => new UnauthorizedException('Identifiants ou mot de passe incorrects');

    if (!user) {
      throw invalid();
    }

    const passwordValid = await this.safeVerify(user.passwordHash, dto.password);
    if (!passwordValid) {
      throw invalid();
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
      !this.tokenStore.isValid(payload.jti, payload.userId)
    ) {
      throw new UnauthorizedException('Refresh token révoqué ou inconnu');
    }

    // Rotation : l'ancien jeton ne pourra plus être réutilisé
    this.tokenStore.revoke(payload.jti);

    const user = this.db.users$.getValue().find((u) => u.id === payload.userId);
    if (!user) {
      throw new UnauthorizedException('Utilisateur introuvable');
    }

    return this.issueTokens(user);
  }

  logout(refreshToken: string): { success: boolean } {
    try {
      const payload = this.jwt.verify(refreshToken) as JwtPayload & { jti?: string };
      if (payload.jti) {
        this.tokenStore.revoke(payload.jti);
      }
    } catch {
      // Logout idempotent : un token déjà invalide n'est pas une erreur
    }
    return { success: true };
  }

  private issueTokens(user: User): TokenPair {
    const payload: JwtPayload = { userId: user.id, email: user.email, role: user.role };

    const accessToken = this.jwt.sign(
      { ...payload, type: 'access' },
      { expiresIn: ACCESS_TTL },
    );

    const jti = randomUUID();
    const refreshToken = this.jwt.sign(
      { ...payload, type: 'refresh' },
      { expiresIn: REFRESH_TTL_SECONDS, jwtid: jti },
    );
    this.tokenStore.save(jti, user.id, REFRESH_TTL_SECONDS);

    return { accessToken, refreshToken };
  }

  // Argon2 lève une erreur si le hash stocké n'est pas un hash Argon2 valide (ex. seed placeholder) :
  // on neutralise ce cas en renvoyant simplement « mot de passe invalide ».
  private async safeVerify(storedHash: string, password: string): Promise<boolean> {
    try {
      return await verify(storedHash, password);
    } catch {
      return false;
    }
  }

  private toPublicUser(user: User): PublicUser {
    const { passwordHash: _passwordHash, ...publicUser } = user;
    void _passwordHash;
    return publicUser;
  }
}
