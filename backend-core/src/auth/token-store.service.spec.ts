import { ServiceUnavailableException } from '@nestjs/common';
import { TokenStore } from './token-store.service';

// ioredis mické : on vérifie les commandes émises, sans vrai serveur.
// `multi()` renvoie un pipeline chaînable dont exec() résout [[null, résultat], …] (SH-36).
function makeRedisMock() {
  const pipeline = {
    set: jest.fn(),
    sadd: jest.fn(),
    expire: jest.fn(),
    exec: jest.fn().mockResolvedValue([
      [null, 'OK'],
      [null, 1],
      [null, 1],
    ]),
  };
  pipeline.set.mockReturnValue(pipeline);
  pipeline.sadd.mockReturnValue(pipeline);
  pipeline.expire.mockReturnValue(pipeline);

  return {
    pipeline,
    multi: jest.fn(() => pipeline),
    get: jest.fn(),
    del: jest.fn().mockResolvedValue(1),
    smembers: jest.fn().mockResolvedValue([]),
  } as any;
}

describe('TokenStore (Redis)', () => {
  it('save écrit clé refresh + index + TTL dans UNE transaction MULTI (atomicité, SH-36)', async () => {
    const redis = makeRedisMock();
    const store = new TokenStore(redis);
    await store.save('jti-1', 'user-1', 900);

    // F6 (revue SH-14) : SET/SADD/EXPIRE séquentiels pouvaient laisser un jti valide
    // mais absent de l'index de révocation globale. Les trois commandes partent
    // désormais dans le même MULTI/EXEC — jamais l'une sans les autres.
    expect(redis.multi).toHaveBeenCalledTimes(1);
    expect(redis.pipeline.set).toHaveBeenCalledWith('refresh:jti-1', 'user-1', 'EX', 900);
    expect(redis.pipeline.sadd).toHaveBeenCalledWith('user:user-1:jtis', 'jti-1');
    expect(redis.pipeline.expire).toHaveBeenCalledWith('user:user-1:jtis', 900);
    expect(redis.pipeline.exec).toHaveBeenCalledTimes(1);
  });

  it('save : panne Redis => 503 explicite, jamais un 500 opaque (F2, fail-closed)', async () => {
    const redis = makeRedisMock();
    redis.pipeline.exec.mockRejectedValue(new Error('connexion Redis perdue'));
    const store = new TokenStore(redis);

    await expect(store.save('jti-1', 'user-1', 900)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it("save : une commande refusée DANS la transaction => 503 (l'écriture partielle est traitée en panne)", async () => {
    const redis = makeRedisMock();
    redis.pipeline.exec.mockResolvedValue([
      [null, 'OK'],
      [new Error('SADD refusé'), null],
      [null, 1],
    ]);
    const store = new TokenStore(redis);

    await expect(store.save('jti-1', 'user-1', 900)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('save : exec() null (connexion coupée pendant MULTI) => 503', async () => {
    const redis = makeRedisMock();
    redis.pipeline.exec.mockResolvedValue(null);
    const store = new TokenStore(redis);

    await expect(store.save('jti-1', 'user-1', 900)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('revoke : panne Redis => 503 explicite (la rotation refuse proprement, F2)', async () => {
    const redis = makeRedisMock();
    redis.del.mockRejectedValue(new Error('connexion Redis perdue'));
    const store = new TokenStore(redis);

    await expect(store.revoke('jti-1')).rejects.toThrow(ServiceUnavailableException);
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
