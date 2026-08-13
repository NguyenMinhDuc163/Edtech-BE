import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCourseContentAvailability1786700000000
  implements MigrationInterface
{
  name = 'AddCourseContentAvailability1786700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "course_contents"
      ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true
    `);
    await queryRunner.query(`
      UPDATE "course_contents" SET "is_active" = true WHERE "is_active" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "course_contents" ALTER COLUMN "is_active" SET DEFAULT true
    `);
    await queryRunner.query(`
      ALTER TABLE "course_contents" ALTER COLUMN "is_active" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "courses"
      ADD COLUMN IF NOT EXISTS "content_enabled" boolean NOT NULL DEFAULT false
    `);

    // Preserve courses that were already actively sold through IAP before the
    // new content switch existed. Other courses remain opt-in.
    await queryRunner.query(`
      UPDATE "courses"
      SET "content_enabled" = true
      WHERE "mobile_iap_enabled" = true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "courses" DROP COLUMN IF EXISTS "content_enabled"',
    );
    await queryRunner.query(
      'ALTER TABLE "course_contents" DROP COLUMN IF EXISTS "is_active"',
    );
  }
}
