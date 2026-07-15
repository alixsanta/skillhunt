import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

/**
 * Bootstrap COMPLET de l'application (intégration, SH-41).
 *
 * Contrairement au smoke test de `app.setup.spec.ts` (qui exerce la configuration sur un
 * module minimal, sans infrastructure), ce test instancie le VRAI `AppModule` : tous les
 * modules, providers et connexions (PostgreSQL, Redis) doivent se résoudre.
 *
 * Il exige l'infrastructure locale (`docker compose up -d`) : même convention d'opt-in que
 * `token-store.integration.spec.ts` — skipped sans la variable d'environnement.
 * Lancement : `BOOTSTRAP_SMOKE=1 npx jest app.bootstrap`.
 */
const describeIf = process.env.BOOTSTRAP_SMOKE === '1' ? describe : describe.skip;

describeIf("Bootstrap complet de l'AppModule (intégration — SH-41)", () => {
  it("instancie l'application réelle, la configure comme main.ts, et répond en HTTP", async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = configureApp(moduleRef.createNestApplication());

    try {
      await app.listen(0);
      const response = await fetch(`${await app.getUrl()}/api/docs-json`);
      expect(response.status).toBe(200);
    } finally {
      await app.close();
    }
  }, 30000);
});
