import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration SH-16a : table `user_media` (médias de portfolio).
 *
 * Calque de `AddCertifications` : UUID `gen_random_uuid()`, types énumérés DÉDIÉS,
 * FK CASCADE, index sur le statut et sur `freelanceId`. `renditions` en `jsonb`
 * (décision D8) ; `sizeBytes` en `bigint` (un master 4K dépasse la plage d'un `int`).
 */
export class AddMedia1719550000000 implements MigrationInterface {
  name = 'AddMedia1719550000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."media_status_enum" AS ENUM('DRAFT', 'UPLOADED', 'PROCESSING', 'READY', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."media_type_enum" AS ENUM('VIDEO', 'VIDEO_360')`,
    );

    await queryRunner.query(`
      CREATE TABLE "user_media" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "title" character varying(120) NOT NULL,
        "description" text,
        "type" "public"."media_type_enum" NOT NULL DEFAULT 'VIDEO',
        "status" "public"."media_status_enum" NOT NULL DEFAULT 'DRAFT',
        "sourceKey" character varying NOT NULL,
        "posterKey" character varying,
        "hlsPrefix" character varying,
        "renditions" jsonb,
        "durationSeconds" integer,
        "width" integer,
        "height" integer,
        "sizeBytes" bigint,
        "mimeType" character varying NOT NULL,
        "errorReason" character varying,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "processedAt" TIMESTAMP WITH TIME ZONE,
        "freelanceId" uuid NOT NULL,
        CONSTRAINT "PK_user_media_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_media_status" ON "user_media" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_media_freelanceId" ON "user_media" ("freelanceId")`);
    await queryRunner.query(
      `ALTER TABLE "user_media" ADD CONSTRAINT "FK_media_freelance" ` +
        `FOREIGN KEY ("freelanceId") REFERENCES "users"("id") ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user_media" DROP CONSTRAINT "FK_media_freelance"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_media_freelanceId"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_media_status"`);
    await queryRunner.query(`DROP TABLE "user_media"`);
    await queryRunner.query(`DROP TYPE "public"."media_type_enum"`);
    await queryRunner.query(`DROP TYPE "public"."media_status_enum"`);
  }
}
