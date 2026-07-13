import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { REFRESH_COOKIE_NAME } from './refresh-cookie';

// Faux Response Express : on n'observe que ce qui nous intéresse — les cookies posés.
function makeResponse() {
  return {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  } as unknown as Response & { cookie: jest.Mock; clearCookie: jest.Mock };
}

// Faux Request Express : `cookies` est peuplé par cookie-parser en vrai.
function makeRequest(cookies: Record<string, string> = {}) {
  return { cookies } as unknown as Request;
}

describe('AuthController — transport du refresh token (SH-20)', () => {
  let controller: AuthController;
  const authService = {
    register: jest.fn(),
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();
    controller = module.get<AuthController>(AuthController);
  });

  it('login dépose le refresh token dans un cookie httpOnly restreint aux routes d\'auth', async () => {
    authService.login.mockResolvedValue({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    const res = makeResponse();

    const body = await controller.login({ email: 'a@b.io', password: 'motdepasse8' }, res);

    expect(res.cookie).toHaveBeenCalledWith(
      REFRESH_COOKIE_NAME,
      'refresh-1',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        path: '/api/v1/auth',
      }),
    );
    // Le body reste inchangé : le mobile (Lot 2) consomme le refresh token par cette voie.
    expect(body).toEqual({ accessToken: 'access-1', refreshToken: 'refresh-1' });
  });

  it('refresh lit le token depuis le COOKIE quand le body est vide (parcours web)', async () => {
    authService.refresh.mockResolvedValue({ accessToken: 'access-2', refreshToken: 'refresh-2' });
    const res = makeResponse();

    await controller.refresh(makeRequest({ [REFRESH_COOKIE_NAME]: 'refresh-1' }), {}, res);

    expect(authService.refresh).toHaveBeenCalledWith('refresh-1');
    // Rotation : le nouveau token remplace l'ancien dans le cookie.
    expect(res.cookie).toHaveBeenCalledWith(REFRESH_COOKIE_NAME, 'refresh-2', expect.any(Object));
  });

  it('refresh accepte encore le token dans le BODY (parcours mobile, Lot 2)', async () => {
    authService.refresh.mockResolvedValue({ accessToken: 'access-2', refreshToken: 'refresh-2' });

    await controller.refresh(makeRequest(), { refreshToken: 'refresh-mobile' }, makeResponse());

    expect(authService.refresh).toHaveBeenCalledWith('refresh-mobile');
  });

  it('le cookie a la priorité sur le body', async () => {
    authService.refresh.mockResolvedValue({ accessToken: 'a', refreshToken: 'r' });

    await controller.refresh(
      makeRequest({ [REFRESH_COOKIE_NAME]: 'depuis-cookie' }),
      { refreshToken: 'depuis-body' },
      makeResponse(),
    );

    expect(authService.refresh).toHaveBeenCalledWith('depuis-cookie');
  });

  it('refresh sans cookie NI body est rejeté en 401', async () => {
    await expect(controller.refresh(makeRequest(), {}, makeResponse())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(authService.refresh).not.toHaveBeenCalled();
  });

  it('logout révoque le token et expire le cookie', async () => {
    authService.logout.mockResolvedValue({ success: true });
    const res = makeResponse();

    await controller.logout(makeRequest({ [REFRESH_COOKIE_NAME]: 'refresh-1' }), {}, res);

    expect(authService.logout).toHaveBeenCalledWith('refresh-1');
    expect(res.clearCookie).toHaveBeenCalledWith(
      REFRESH_COOKIE_NAME,
      expect.objectContaining({ path: '/api/v1/auth' }),
    );
  });

  it('logout sans aucun token reste idempotent (pas de 401) et expire quand même le cookie', async () => {
    const res = makeResponse();

    await expect(controller.logout(makeRequest(), {}, res)).resolves.toEqual({ success: true });
    expect(authService.logout).not.toHaveBeenCalled();
    expect(res.clearCookie).toHaveBeenCalled();
  });
});
