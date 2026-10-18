import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Roles become data: an optional owning organization (custom org roles), a
 * description, and an `is_system` flag for seed-owned roles. Role keys are
 * unique among platform roles and within each organization.
 */
export class DynamicRoles1792350000000 implements MigrationInterface {
  name = 'DynamicRoles1792350000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_a87cf0659c3ac379b339acf36a"`);
    await queryRunner.query(
      `ALTER TABLE "roles" ADD "description" character varying(255)`,
    );
    await queryRunner.query(`ALTER TABLE "roles" ADD "organization_id" uuid`);
    await queryRunner.query(
      `ALTER TABLE "roles" ADD "is_system" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_roles_organization_id" ON "roles" ("organization_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_roles_platform_key" ON "roles" ("key") WHERE "organization_id" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_roles_organization_key" ON "roles" ("organization_id", "key") WHERE "organization_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "roles" ADD CONSTRAINT "CHK_roles_global_platform_wide" CHECK ("scope" = 'organization' OR "organization_id" IS NULL)`,
    );
    await queryRunner.query(
      `ALTER TABLE "roles" ADD CONSTRAINT "FK_roles_organization" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Custom org roles cannot exist under the old schema.
    await queryRunner.query(
      `DELETE FROM "roles" WHERE "organization_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "roles" DROP CONSTRAINT "FK_roles_organization"`,
    );
    await queryRunner.query(
      `ALTER TABLE "roles" DROP CONSTRAINT "CHK_roles_global_platform_wide"`,
    );
    await queryRunner.query(`DROP INDEX "UQ_roles_organization_key"`);
    await queryRunner.query(`DROP INDEX "UQ_roles_platform_key"`);
    await queryRunner.query(`DROP INDEX "IDX_roles_organization_id"`);
    await queryRunner.query(`ALTER TABLE "roles" DROP COLUMN "is_system"`);
    await queryRunner.query(
      `ALTER TABLE "roles" DROP COLUMN "organization_id"`,
    );
    await queryRunner.query(`ALTER TABLE "roles" DROP COLUMN "description"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_a87cf0659c3ac379b339acf36a" ON "roles" ("key")`,
    );
  }
}
