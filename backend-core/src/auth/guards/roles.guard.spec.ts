import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard, JwtPayload } from './jwt-auth.guard';
import { UserRole } from '../../common/enums';

// Fabrique un ExecutionContext minimal portant l'utilisateur injecté par le JwtAuthGuard
function buildContext(user: JwtPayload | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

// RolesGuard équipé d'un Reflector qui renvoie les rôles requis voulus pour le test
function guardRequiring(roles: UserRole[] | undefined): RolesGuard {
  const reflector = { getAllAndOverride: () => roles } as unknown as Reflector;
  return new RolesGuard(reflector);
}

describe('🛡️ RolesGuard (RBAC — SH-8)', () => {
  it('autorise un utilisateur ayant le rôle requis', () => {
    const guard = guardRequiring([UserRole.FREELANCE]);
    const ctx = buildContext({ userId: '1', email: 'a@x.io', role: UserRole.FREELANCE });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('refuse (403) un utilisateur dont le rôle est insuffisant', () => {
    const guard = guardRequiring([UserRole.ADMIN]);
    const ctx = buildContext({ userId: '1', email: 'a@x.io', role: UserRole.FREELANCE });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('refuse (403) en l\'absence d\'utilisateur authentifié', () => {
    const guard = guardRequiring([UserRole.FREELANCE]);
    const ctx = buildContext(undefined);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('laisse passer quand aucun rôle n\'est requis (@Roles absent)', () => {
    const guard = guardRequiring(undefined);
    const ctx = buildContext({ userId: '1', email: 'a@x.io', role: UserRole.RECRUITER });
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
