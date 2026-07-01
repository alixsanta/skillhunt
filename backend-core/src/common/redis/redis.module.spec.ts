import { Test } from '@nestjs/testing';
import Redis from 'ioredis';
import { RedisModule, REDIS_CLIENT } from './redis.module';

describe('RedisModule', () => {
  it('fournit un client ioredis via le token REDIS_CLIENT', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [RedisModule],
    }).compile();

    const client = moduleRef.get<Redis>(REDIS_CLIENT);
    expect(client).toBeDefined();
    expect(typeof client.xadd).toBe('function');

    await client.quit();
  });
});
