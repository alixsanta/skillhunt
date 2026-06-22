import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration initiale (SH-6) : active PostGIS, crée les tables `users` et `gear`
 * avec UUID v4, types enum, index de recherche et index spatial GiST sur la position.
 * Remplace l'ancien placeholder en mémoire (DbState).
 */
export class InitSchema1718960000000 implements MigrationInterface {
  name = 'InitSchema1718960000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Extension géospatiale : indispensable au matching par localisation (SH-13)
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS postgis`);

    // Types énumérés métier
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('FREELANCE', 'RECRUITER', 'ADMIN')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."gear_status_enum" AS ENUM('PENDING', 'VALIDATED', 'REJECTED')`,
    );

    // Table des utilisateurs
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "email" character varying NOT NULL,
        "username" character varying NOT NULL,
        "passwordHash" character varying NOT NULL,
        "role" "public"."users_role_enum" NOT NULL DEFAULT 'FREELANCE',
        "location" geography(Point, 4326),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_users_email" UNIQUE ("email"),
        CONSTRAINT "PK_users_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_users_role" ON "users" ("role")`);
    // Index spatial GiST : requêtes de proximité performantes (ST_DWithin / ST_Distance)
    await queryRunner.query(
      `CREATE INDEX "IDX_users_location" ON "users" USING GiST ("location")`,
    );

    // Table de l'Armurerie (Gear Locker)
    await queryRunner.query(`
      CREATE TABLE "gear" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "brand" character varying NOT NULL,
        "model" character varying NOT NULL,
        "serialNumber" character varying NOT NULL,
        "status" "public"."gear_status_enum" NOT NULL DEFAULT 'PENDING',
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "freelanceId" uuid NOT NULL,
        CONSTRAINT "PK_gear_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_gear_freelanceId" ON "gear" ("freelanceId")`);
    await queryRunner.query(
      `ALTER TABLE "gear" ADD CONSTRAINT "FK_gear_freelance" ` +
        `FOREIGN KEY ("freelanceId") REFERENCES "users"("id") ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "gear" DROP CONSTRAINT "FK_gear_freelance"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_gear_freelanceId"`);
    await queryRunner.query(`DROP TABLE "gear"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_users_location"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_users_role"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."gear_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
    // L'extension postgis est volontairement conservée (potentiellement partagée).
  }
}
