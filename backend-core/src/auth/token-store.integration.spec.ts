import Redis from 'ioredis';
import { TokenStore } from './token-store.service';

// C2.2.2 — Intégration Redis réelle : round-trip save → isValid avec vrai TTL
const url = process.env.REDIS_URL;
const describeIf = url ? describe : describe.skip;

describeIf('TokenStore (intégration Redis)', () => {
  let redis: Redis;
  let store: TokenStore;

  beforeAll(() => {
    redis = new Redis(url as string);
    store = new TokenStore(redis);
  });

  afterAll(async () => {
    await redis.flushdb();
    await redis.quit();
  });

  it('save puis isValid retourne true, revoke invalide', async () => {
    await store.save('jti-int', 'user-int', 60);
    expect(await store.isValid('jti-int', 'user-int')).toBe(true);
    await store.revoke('jti-int');
    expect(await store.isValid('jti-int', 'user-int')).toBe(false);
  });

  it("revokeAllForUser purge tous les jetons de l'utilisateur", async () => {
    await store.save('jti-a', 'user-multi', 60);
    await store.save('jti-b', 'user-multi', 60);
    await store.revokeAllForUser('user-multi');
    expect(await store.isValid('jti-a', 'user-multi')).toBe(false);
    expect(await store.isValid('jti-b', 'user-multi')).toBe(false);
  });
});
