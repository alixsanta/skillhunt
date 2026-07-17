import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { GamificationController } from './gamification.controller';
import { GamificationService } from './gamification.service';
import { ROLES_KEY, JwtAuthGuard, RolesGuard } from '../auth/guards/jwt-auth.guard';
import { UserRole } from '../common/enums';

describe('🏅 GamificationController (SH-21c)', () => {
  let controller: GamificationController;
  const profileFor = jest.fn();
  const publicProfileFor = jest.fn();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GamificationController],
      providers: [
        { provide: GamificationService, useValue: { profileFor, publicProfileFor } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();
    controller = module.get(GamificationController);
  });

  it('GET me : réservé au rôle FREELANCE (RBAC déclaratif)', () => {
    const roles = new Reflector().get(ROLES_KEY, GamificationController.prototype.getMyProfile);
    expect(roles).toEqual([UserRole.FREELANCE]);
  });

  it('GET freelance/:id : réservé au rôle RECRUITER', () => {
    const roles = new Reflector().get(ROLES_KEY, GamificationController.prototype.getPublicProfile);
    expect(roles).toEqual([UserRole.RECRUITER]);
  });

  it("me : délègue avec l'identité du TOKEN, jamais un id client (C2.2.3)", async () => {
    await controller.getMyProfile({ userId: 'u-1', email: 'a@b.c', role: UserRole.FREELANCE });
    expect(profileFor).toHaveBeenCalledWith('u-1');
  });

  it('freelance/:id : délègue avec le paramètre de route', async () => {
    await controller.getPublicProfile('u-cible');
    expect(publicProfileFor).toHaveBeenCalledWith('u-cible');
  });
});
