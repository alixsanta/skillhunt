import { MigrationInterface, QueryRunner } from 'typeorm';

/** SH-21c — vitrine « loadout » : épinglage d'équipements validés (max 4, règle service). */
export class AddGearLoadout1719450000000 implements MigrationInterface {
  name = 'AddGearLoadout1719450000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "gear" ADD "isInLoadout" boolean NOT NULL DEFAULT false`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "gear" DROP COLUMN "isInLoadout"`);
  }
}
