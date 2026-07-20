import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SH-34 — Garde-fou d'intégrité (défense en profondeur, C2.2.3) :
 * un FREELANCE doit toujours avoir une position (sinon il est invisible du
 * matching par rayon, SH-13). La 1re ligne de défense est le DTO (RegisterDto) ;
 * cette contrainte couvre toute écriture qui contournerait l'API.
 *
 * Reprise de données : AUCUNE (décision D4 de la spec 2026-07-06) — pas de prod,
 * les bases dev/CI sont reconstruites par migrations. Si une base dev locale
 * contient des freelances de test sans position, la migration échouera :
 * `docker compose down -v` puis re-migrer.
 */
export class AddFreelanceLocationCheck1719250000000 implements MigrationInterface {
  name = 'AddFreelanceLocationCheck1719250000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "CHK_users_freelance_location" ` +
        `CHECK (role <> 'FREELANCE' OR location IS NOT NULL)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "CHK_users_freelance_location"`,
    );
  }
}
