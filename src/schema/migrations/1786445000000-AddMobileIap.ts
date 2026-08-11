import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMobileIap1786445000000 implements MigrationInterface {
  name = 'AddMobileIap1786445000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    await queryRunner.query(
      'ALTER TABLE "users" ADD COLUMN "revenuecat_app_user_id" uuid',
    );
    await queryRunner.query(
      'UPDATE "users" SET "revenuecat_app_user_id" = gen_random_uuid() WHERE "revenuecat_app_user_id" IS NULL',
    );
    await queryRunner.query(
      'ALTER TABLE "users" ALTER COLUMN "revenuecat_app_user_id" SET DEFAULT gen_random_uuid()',
    );
    await queryRunner.query(
      'ALTER TABLE "users" ALTER COLUMN "revenuecat_app_user_id" SET NOT NULL',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_users_revenuecat_app_user_id" ON "users" ("revenuecat_app_user_id")',
    );

    await queryRunner.query(
      'ALTER TABLE "courses" ADD COLUMN "mobile_iap_enabled" boolean NOT NULL DEFAULT false',
    );

    await queryRunner.query(`
      CREATE TABLE "course_store_products" (
        "id" BIGSERIAL NOT NULL,
        "course_id" bigint NOT NULL,
        "platform" varchar(20) NOT NULL,
        "store" varchar(30) NOT NULL,
        "product_id" varchar(255) NOT NULL,
        "entitlement_id" varchar(255) NOT NULL,
        "product_type" varchar(30) NOT NULL DEFAULT 'NON_CONSUMABLE',
        "is_active" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_course_store_products" PRIMARY KEY ("id"),
        CONSTRAINT "FK_course_store_products_course" FOREIGN KEY ("course_id") REFERENCES "courses"("course_id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_course_store_product_platform_product" ON "course_store_products" ("platform", "product_id")',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_course_store_product_active_course_platform" ON "course_store_products" ("course_id", "platform") WHERE "is_active" = true',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_course_store_product_course" ON "course_store_products" ("course_id")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_course_store_product_entitlement" ON "course_store_products" ("entitlement_id")',
    );

    await queryRunner.query(`
      CREATE TABLE "iap_purchases" (
        "id" BIGSERIAL NOT NULL,
        "user_id" bigint NOT NULL,
        "course_id" bigint NOT NULL,
        "store_product_id" bigint NOT NULL,
        "revenuecat_app_user_id" uuid NOT NULL,
        "store" varchar(30) NOT NULL,
        "environment" varchar(20) NOT NULL,
        "product_id" varchar(255) NOT NULL,
        "entitlement_id" varchar(255) NOT NULL,
        "transaction_id" varchar(255) NOT NULL,
        "original_transaction_id" varchar(255),
        "status" varchar(20) NOT NULL DEFAULT 'ACTIVE',
        "price" numeric(12,2),
        "currency" varchar(10),
        "country_code" varchar(2),
        "purchased_at" timestamptz NOT NULL,
        "revoked_at" timestamptz,
        "raw_last_event" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_iap_purchases" PRIMARY KEY ("id"),
        CONSTRAINT "FK_iap_purchases_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_iap_purchases_course" FOREIGN KEY ("course_id") REFERENCES "courses"("course_id") ON DELETE CASCADE,
        CONSTRAINT "FK_iap_purchases_store_product" FOREIGN KEY ("store_product_id") REFERENCES "course_store_products"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_iap_purchase_transaction" ON "iap_purchases" ("store", "environment", "transaction_id")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_iap_purchase_user_course_status" ON "iap_purchases" ("user_id", "course_id", "status")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_iap_purchase_rc_user" ON "iap_purchases" ("revenuecat_app_user_id")',
    );

    await queryRunner.query(`
      CREATE TABLE "revenuecat_webhook_events" (
        "id" BIGSERIAL NOT NULL,
        "event_id" varchar(255) NOT NULL,
        "event_type" varchar(50) NOT NULL,
        "environment" varchar(20),
        "app_id" varchar(255),
        "processing_status" varchar(20) NOT NULL DEFAULT 'RECEIVED',
        "failure_reason" text,
        "payload" jsonb,
        "received_at" timestamptz NOT NULL DEFAULT now(),
        "processed_at" timestamptz,
        CONSTRAINT "PK_revenuecat_webhook_events" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_revenuecat_webhook_event_id" UNIQUE ("event_id")
      )
    `);

    await queryRunner.query(
      'ALTER TABLE "course_registrations" ADD COLUMN "access_source" varchar(20)',
    );
    await queryRunner.query(
      'ALTER TABLE "course_registrations" ADD COLUMN "iap_purchase_id" bigint',
    );
    await queryRunner.query(
      'ALTER TABLE "course_registrations" ADD COLUMN "revoked_at" timestamptz',
    );
    await queryRunner.query(`
      UPDATE "course_registrations"
      SET "access_source" = CASE
        WHEN "payment_method" = 'VNPAY' THEN 'VNPAY'
        WHEN "amount_paid" = 0 THEN 'FREE'
        ELSE 'ADMIN'
      END
      WHERE "access_source" IS NULL
    `);
    await queryRunner.query(
      'ALTER TABLE "course_registrations" ADD CONSTRAINT "FK_course_registrations_iap_purchase" FOREIGN KEY ("iap_purchase_id") REFERENCES "iap_purchases"("id") ON DELETE SET NULL',
    );

    await queryRunner.query(`
      INSERT INTO "system_parameters" ("param_key", "param_value", "description", "function_name")
      VALUES
        ('MOBILE_IAP_ENABLED', 'N', 'Bat/tat checkout IAP tren mobile; khong thay doi quyen hoc', 'PAYMENT_CONFIG'),
        ('WEB_VNPAY_ENABLED', 'Y', 'Bat/tat checkout VNPay tren web', 'PAYMENT_CONFIG')
      ON CONFLICT ("param_key") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "DELETE FROM \"system_parameters\" WHERE \"param_key\" IN ('MOBILE_IAP_ENABLED', 'WEB_VNPAY_ENABLED')",
    );
    await queryRunner.query(
      'ALTER TABLE "course_registrations" DROP CONSTRAINT IF EXISTS "FK_course_registrations_iap_purchase"',
    );
    await queryRunner.query(
      'ALTER TABLE "course_registrations" DROP COLUMN IF EXISTS "revoked_at"',
    );
    await queryRunner.query(
      'ALTER TABLE "course_registrations" DROP COLUMN IF EXISTS "iap_purchase_id"',
    );
    await queryRunner.query(
      'ALTER TABLE "course_registrations" DROP COLUMN IF EXISTS "access_source"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "revenuecat_webhook_events"');
    await queryRunner.query('DROP TABLE IF EXISTS "iap_purchases"');
    await queryRunner.query('DROP TABLE IF EXISTS "course_store_products"');
    await queryRunner.query(
      'ALTER TABLE "courses" DROP COLUMN IF EXISTS "mobile_iap_enabled"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_users_revenuecat_app_user_id"',
    );
    await queryRunner.query(
      'ALTER TABLE "users" DROP COLUMN IF EXISTS "revenuecat_app_user_id"',
    );
  }
}
