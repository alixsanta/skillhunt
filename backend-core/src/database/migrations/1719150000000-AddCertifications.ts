import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration SH-10 : table `user_certifications` (certifications professionnelles).
 *
 * Calque de la migration `gear` (InitSchema) : UUID v4, types enum dédiés, FK CASCADE,
 * index sur le statut (file de validation admin) et sur `freelanceId` (étanchéité + jointures).
 * `s3Key`, `reviewedAt`, `purgedAt` nullables : matérialisent le cycle de vie / la purge RGPD.
 */
export class AddCertifications1719150000000 implements MigrationInterface {
  name = 'AddCertifications1719150000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Types énumérés dédiés (découplés de gear_status_enum)
    await queryRunner.query(
      `CREATE TYPE "public"."certifications_type_enum" AS ENUM('DGAC_DRONE', 'ELEC_HABILITATION', 'OTHER')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."certifications_status_enum" AS ENUM('PENDING', 'VALIDATED', 'REJECTED')`,
    );

    await queryRunner.query(`
      CREATE TABLE "user_certifications" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "type" "public"."certifications_type_enum" NOT NULL DEFAULT 'OTHER',
        "number" character varying NOT NULL,
        "validUntil" date NOT NULL,
        "status" "public"."certifications_status_enum" NOT NULL DEFAULT 'PENDING',
        "s3Key" character varying,
        "mimeType" character varying NOT NULL,
        "uploadedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "reviewedAt" TIMESTAMP WITH TIME ZONE,
        "purgedAt" TIMESTAMP WITH TIME ZONE,
        "freelanceId" uuid NOT NULL,
        CONSTRAINT "PK_user_certifications_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_certifications_status" ON "user_certifications" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_certifications_freelanceId" ON "user_certifications" ("freelanceId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_certifications" ADD CONSTRAINT "FK_certifications_freelance" ` +
        `FOREIGN KEY ("freelanceId") REFERENCES "users"("id") ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_certifications" DROP CONSTRAINT "FK_certifications_freelance"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_certifications_freelanceId"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_certifications_status"`);
    await queryRunner.query(`DROP TABLE "user_certifications"`);
    await queryRunner.query(`DROP TYPE "public"."certifications_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."certifications_type_enum"`);
  }
}
