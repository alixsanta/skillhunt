import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  ExecutionContext,
  CanActivate,
  createParamDecorator,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '../../common/enums';

export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
}

// Décorateur personnalisé pour extraire l'utilisateur connecté dans les contrôleurs
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);

// Clé de métadonnée + décorateur déclaratif pour restreindre une route à certains rôles (RBAC — SH-8)
export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token d\'accès de sécurité manquant ou mal formé');
    }

    const token = authHeader.split(' ')[1];

    try {
      // Vérification cryptographique réelle de la signature RS256 et de l'expiration (C2.2.3)
      const payload = this.jwt.verify(token) as JwtPayload & { type?: string };

      // Un refresh token ne doit jamais servir à accéder à une ressource protégée
      if (payload.type !== 'access') {
        throw new UnauthorizedException('Type de token invalide pour cette ressource');
      }

      request.user = { userId: payload.userId, email: payload.email, role: payload.role };
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Token de sécurité invalide ou expiré');
    }
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Rôles requis déclarés via @Roles() sur la route (handler) ou le contrôleur (class)
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Aucune restriction de rôle : l'accès reste régi par le seul JwtAuthGuard
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayload | undefined;

    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException(
        'Votre profil n\'a pas les autorisations nécessaires pour cette ressource',
      );
    }
    return true;
  }
}
