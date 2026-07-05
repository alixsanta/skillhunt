import { Global, Module } from '@nestjs/common';
import Redis from 'ioredis';

// Token d'injection du client Redis partagé (C2.2.3 — URL via env, jamais en dur)
export const REDIS_CLIENT = 'REDIS_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (): Redis => {
        const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
        // lazyConnect : on ne bloque pas le bootstrap si Redis n'est pas encore prêt
        return new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 2 });
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
