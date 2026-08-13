import { MigrationInterface, QueryRunner } from 'typeorm';

export class SyncPostUpgradeFields1786600000000
  implements MigrationInterface
{
  name = 'SyncPostUpgradeFields1786600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // is_ads was added to User after the Mobile IAP migration. IF NOT EXISTS
    // keeps this migration safe for databases where the column was added
    // manually before migrations were formalised.
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "is_ads" varchar(1) NOT NULL DEFAULT 'Y'
    `);

    // Normalise legacy null/empty values without changing explicit N values.
    await queryRunner.query(`
      UPDATE "users"
      SET "is_ads" = 'Y'
      WHERE "is_ads" IS NULL OR BTRIM("is_ads") = ''
    `);
    await queryRunner.query(`
      ALTER TABLE "users" ALTER COLUMN "is_ads" SET DEFAULT 'Y'
    `);
    await queryRunner.query(`
      ALTER TABLE "users" ALTER COLUMN "is_ads" SET NOT NULL
    `);

    // The legacy create_sections_table.sql predates the is_preview field even
    // though the TypeORM entity already expects it. This keeps databases made
    // from that script compatible with the Admin content-access screen.
    await queryRunner.query(`
      ALTER TABLE "course_sections"
      ADD COLUMN IF NOT EXISTS "is_preview" varchar(1) NOT NULL DEFAULT 'N'
    `);
    await queryRunner.query(`
      UPDATE "course_sections"
      SET "is_preview" = 'N'
      WHERE "is_preview" IS NULL OR BTRIM("is_preview") = ''
    `);
    await queryRunner.query(`
      ALTER TABLE "course_sections" ALTER COLUMN "is_preview" SET DEFAULT 'N'
    `);
    await queryRunner.query(`
      ALTER TABLE "course_sections" ALTER COLUMN "is_preview" SET NOT NULL
    `);

  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Deliberately non-destructive. The column may have existed before this
    // migration on databases that were upgraded manually.
  }
}
