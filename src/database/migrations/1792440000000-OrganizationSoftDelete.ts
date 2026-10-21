import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Organizations are soft-deleted (`deleted_at`). The slug is unique among live
 * organizations only, so a deleted organization frees its slug.
 */
export class OrganizationSoftDelete1792440000000 implements MigrationInterface {
  name = 'OrganizationSoftDelete1792440000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD "deleted_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(`DROP INDEX "IDX_963693341bd612aa01ddf3a4b6"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_organizations_slug_active" ON "organizations" ("slug") WHERE "deleted_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Deleted organizations may share a slug with live ones, which the old
    // unique index forbids; they are removed for good (cascading).
    await queryRunner.query(
      `DELETE FROM "organizations" WHERE "deleted_at" IS NOT NULL`,
    );
    await queryRunner.query(`DROP INDEX "UQ_organizations_slug_active"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_963693341bd612aa01ddf3a4b6" ON "organizations" ("slug")`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP COLUMN "deleted_at"`,
    );
  }
}
