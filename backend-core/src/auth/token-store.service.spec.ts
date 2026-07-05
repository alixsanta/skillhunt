import { TokenStore } from './token-store.service';

// ioredis mické : on vérifie les commandes émises, sans vrai serveur
function makeRedisMock() {
  return {
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn(),
    del: jest.fn().mockResolvedValue(1),
    sadd: jest.fn().mockResolvedValue(1),
    srem: jest.fn().mockResolvedValue(1),
    smembers: jest.fn().mockResolvedValue([]),
    expire: jest.fn().mockResolvedValue(1),
  } as any;
}

describe('TokenStore (Redis)', () => {
  it('save écrit la clé refresh avec TTL natif', async () => {
    const redis = makeRedisMock();
    const store = new TokenStore(redis);
    await store.save('jti-1', 'user-1', 900);
    expect(redis.set).toHaveBeenCalledWith('refresh:jti-1', 'user-1', 'EX', 900);
    expect(redis.sadd).toHaveBeenCalledWith('user:user-1:jtis', 'jti-1');
  });

  it('isValid renvoie true si le userId correspond', async () => {
    const redis = makeRedisMock();
    redis.get.mockResolvedValue('user-1');
    const store = new TokenStore(redis);
    await expect(store.isValid('jti-1', 'user-1')).resolves.toBe(true);
  });

  it('isValid renvoie false si absent ou userId différent', async () => {
    const redis = makeRedisMock();
    redis.get.mockResolvedValue(null);
    const store = new TokenStore(redis);
    await expect(store.isValid('jti-x', 'user-1')).resolves.toBe(false);
    redis.get.mockResolvedValue('autre-user');
    await expect(store.isValid('jti-1', 'user-1')).resolves.toBe(false);
  });

  it('fail-safe : isValid renvoie false si Redis lève', async () => {
    const redis = makeRedisMock();
    redis.get.mockRejectedValue(new Error('connexion Redis perdue'));
    const store = new TokenStore(redis);
    await expect(store.isValid('jti-1', 'user-1')).resolves.toBe(false);
  });

  it('revoke supprime la clé', async () => {
    const redis = makeRedisMock();
    const store = new TokenStore(redis);
    await store.revoke('jti-1');
    expect(redis.del).toHaveBeenCalledWith('refresh:jti-1');
  });

  it('revokeAllForUser supprime tous les jti du set', async () => {
    const redis = makeRedisMock();
    redis.smembers.mockResolvedValue(['jti-1', 'jti-2']);
    const store = new TokenStore(redis);
    await store.revokeAllForUser('user-1');
    expect(redis.del).toHaveBeenCalledWith('refresh:jti-1', 'refresh:jti-2');
    expect(redis.del).toHaveBeenCalledWith('user:user-1:jtis');
  });
});
