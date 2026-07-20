import type { CookieOptions } from 'express';

// Nom du cookie portant le refresh token (SH-20).
export const REFRESH_COOKIE_NAME = 'sh_refresh';

// Le cookie n'est envoyé QU'aux routes d'authentification : surface d'exposition minimale.
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

// Aligné sur le TTL du refresh token en Redis (7 jours, cf. auth.service.ts).
export const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Attributs du cookie de refresh.
 *
 * `httpOnly` est la raison d'être de ce cookie : le refresh token (7 jours) devient
 * INACCESSIBLE au JavaScript, donc involable par une XSS — contrairement au localStorage.
 * `sameSite: 'lax'` couvre le CSRF (front et API sur le même site). (C2.2.3)
 */
export function refreshCookieOptions(isProduction: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction, // jamais en clair sur le réseau en production
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
  };
}

/** Mêmes attributs sans `maxAge` : indispensable pour que le navigateur retrouve ET supprime le cookie. */
export function clearRefreshCookieOptions(isProduction: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
  };
}
