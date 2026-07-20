import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SH-40 — Colonnes 2FA TOTP sur `users` :
 * - `twoFactorEnabled` : la 2FA n'est active qu'après confirmation du premier code ;
 * - `twoFactorSecretEncrypted` : secret TOTP chiffré AES-256-GCM, JAMAIS en clair (§8-6) ;
 * - `twoFactorBackupCodesHashed` : codes de secours à usage unique, hachés Argon2id.
 * Aucune reprise nécessaire : la 2FA est opt-in, tous les comptes existants restent à false.
 */
export class AddTwoFactorColumns1719350000000 implements MigrationInterface {
  name = 'AddTwoFactorColumns1719350000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users"
         ADD COLUMN "twoFactorEnabled" boolean NOT NULL DEFAULT false,
         ADD COLUMN "twoFactorSecretEncrypted" character varying,
         ADD COLUMN "twoFactorBackupCodesHashed" text[]`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users"
         DROP COLUMN "twoFactorBackupCodesHashed",
         DROP COLUMN "twoFactorSecretEncrypted",
         DROP COLUMN "twoFactorEnabled"`,
    );
  }
}
