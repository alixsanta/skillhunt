import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SH-9 — Ajoute la catégorie de matériel à l'Armurerie + index de filtrage.
 * Nouveau type enum `gear_category_enum`, colonne `category` (NOT NULL, défaut OTHER),
 * et index sur `category` et `status` (file de validation admin).
 */
export class AddGearCategory1719050000000 implements MigrationInterface {
  name = 'AddGearCategory1719050000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."gear_category_enum" AS ENUM('DRONE', 'CAMERA_360', 'ROBOTICS', 'SENSOR', 'OTHER')`,
    );
    await queryRunner.query(
      `ALTER TABLE "gear" ADD "category" "public"."gear_category_enum" NOT NULL DEFAULT 'OTHER'`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_gear_category" ON "gear" ("category")`);
    await queryRunner.query(`CREATE INDEX "IDX_gear_status" ON "gear" ("status")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_gear_status"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_gear_category"`);
    await queryRunner.query(`ALTER TABLE "gear" DROP COLUMN "category"`);
    await queryRunner.query(`DROP TYPE "public"."gear_category_enum"`);
  }
}
