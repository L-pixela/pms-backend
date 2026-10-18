import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1792259040185 implements MigrationInterface {
  name = 'InitialSchema1792259040185';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying(255) NOT NULL, "password_hash" character varying(255), "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users" ("email")`,
    );
    await queryRunner.query(
      `CREATE TABLE "refresh_token_sessions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "session_id" uuid NOT NULL, "token_hash" character varying(255) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_69bc960573ea7449fefeeda45ff" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3928a3152cb3121f5a9b9dd0aa" ON "refresh_token_sessions" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_15fa22bd36bffef8124011ace0" ON "refresh_token_sessions" ("session_id")`,
    );
    await queryRunner.query(
      `CREATE TYPE "roles_scope_enum" AS ENUM('global', 'organization')`,
    );
    await queryRunner.query(
      `CREATE TABLE "roles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "key" character varying(120) NOT NULL, "name" character varying(120) NOT NULL, "scope" "roles_scope_enum" NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_c1433d71a4838793a49dcad46ab" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_a87cf0659c3ac379b339acf36a" ON "roles" ("key")`,
    );
    await queryRunner.query(
      `CREATE TABLE "organizations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "slug" character varying(160) NOT NULL, "name" character varying(200) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_6b031fcd0863e3f6b44230163f9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_963693341bd612aa01ddf3a4b6" ON "organizations" ("slug")`,
    );
    await queryRunner.query(
      `CREATE TABLE "organization_memberships" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "organization_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_cd7be805730a4c778a5f45364af" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5352fc550034d507d6c76dd290" ON "organization_memberships" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_86ae2efbb9ce84dd652e0c96a4" ON "organization_memberships" ("organization_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_caa73db1b161fa6b3a042290fe" ON "organization_memberships" ("user_id", "organization_id")`,
    );
    await queryRunner.query(
      `CREATE TABLE "organization_membership_roles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "membership_id" uuid NOT NULL, "role_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_09a3ec02026ab117783d96853b7" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ef7987eeae5ccce5678d9df0b8" ON "organization_membership_roles" ("membership_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_97ddb9755f12632b1bf91f82cc" ON "organization_membership_roles" ("role_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_0940248b9d218204f57819be2e" ON "organization_membership_roles" ("membership_id", "role_id")`,
    );
    await queryRunner.query(
      `CREATE TABLE "permissions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "key" character varying(120) NOT NULL, "description" character varying(255), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_920331560282b8bd21bb02290df" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_017943867ed5ceef9c03edd974" ON "permissions" ("key")`,
    );
    await queryRunner.query(
      `CREATE TABLE "role_permissions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "role_id" uuid NOT NULL, "permission_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_84059017c90bfcb701b8fa42297" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_178199805b901ccd220ab7740e" ON "role_permissions" ("role_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_17022daf3f885f7d35423e9971" ON "role_permissions" ("permission_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_25d24010f53bb80b78e412c965" ON "role_permissions" ("role_id", "permission_id")`,
    );
    await queryRunner.query(
      `CREATE TABLE "user_global_roles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "role_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_b49d294a320d489c3e52faa28f4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7de48b102eae0c9d0e5f6bc81e" ON "user_global_roles" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_db32dc9ceba2ad64684de1051e" ON "user_global_roles" ("role_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_f7857917429a5ad2d0dff60040" ON "user_global_roles" ("user_id", "role_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_token_sessions" ADD CONSTRAINT "FK_3928a3152cb3121f5a9b9dd0aaf" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization_memberships" ADD CONSTRAINT "FK_5352fc550034d507d6c76dd2901" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization_memberships" ADD CONSTRAINT "FK_86ae2efbb9ce84dd652e0c96a49" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization_membership_roles" ADD CONSTRAINT "FK_ef7987eeae5ccce5678d9df0b87" FOREIGN KEY ("membership_id") REFERENCES "organization_memberships"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization_membership_roles" ADD CONSTRAINT "FK_97ddb9755f12632b1bf91f82ccf" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" ADD CONSTRAINT "FK_178199805b901ccd220ab7740ec" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" ADD CONSTRAINT "FK_17022daf3f885f7d35423e9971e" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_global_roles" ADD CONSTRAINT "FK_7de48b102eae0c9d0e5f6bc81ef" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_global_roles" ADD CONSTRAINT "FK_db32dc9ceba2ad64684de1051e2" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_global_roles" DROP CONSTRAINT "FK_db32dc9ceba2ad64684de1051e2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_global_roles" DROP CONSTRAINT "FK_7de48b102eae0c9d0e5f6bc81ef"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" DROP CONSTRAINT "FK_17022daf3f885f7d35423e9971e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" DROP CONSTRAINT "FK_178199805b901ccd220ab7740ec"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization_membership_roles" DROP CONSTRAINT "FK_97ddb9755f12632b1bf91f82ccf"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization_membership_roles" DROP CONSTRAINT "FK_ef7987eeae5ccce5678d9df0b87"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization_memberships" DROP CONSTRAINT "FK_86ae2efbb9ce84dd652e0c96a49"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization_memberships" DROP CONSTRAINT "FK_5352fc550034d507d6c76dd2901"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_token_sessions" DROP CONSTRAINT "FK_3928a3152cb3121f5a9b9dd0aaf"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_f7857917429a5ad2d0dff60040"`);
    await queryRunner.query(`DROP INDEX "IDX_db32dc9ceba2ad64684de1051e"`);
    await queryRunner.query(`DROP INDEX "IDX_7de48b102eae0c9d0e5f6bc81e"`);
    await queryRunner.query(`DROP TABLE "user_global_roles"`);
    await queryRunner.query(`DROP INDEX "IDX_25d24010f53bb80b78e412c965"`);
    await queryRunner.query(`DROP INDEX "IDX_17022daf3f885f7d35423e9971"`);
    await queryRunner.query(`DROP INDEX "IDX_178199805b901ccd220ab7740e"`);
    await queryRunner.query(`DROP TABLE "role_permissions"`);
    await queryRunner.query(`DROP INDEX "IDX_017943867ed5ceef9c03edd974"`);
    await queryRunner.query(`DROP TABLE "permissions"`);
    await queryRunner.query(`DROP INDEX "IDX_0940248b9d218204f57819be2e"`);
    await queryRunner.query(`DROP INDEX "IDX_97ddb9755f12632b1bf91f82cc"`);
    await queryRunner.query(`DROP INDEX "IDX_ef7987eeae5ccce5678d9df0b8"`);
    await queryRunner.query(`DROP TABLE "organization_membership_roles"`);
    await queryRunner.query(`DROP INDEX "IDX_caa73db1b161fa6b3a042290fe"`);
    await queryRunner.query(`DROP INDEX "IDX_86ae2efbb9ce84dd652e0c96a4"`);
    await queryRunner.query(`DROP INDEX "IDX_5352fc550034d507d6c76dd290"`);
    await queryRunner.query(`DROP TABLE "organization_memberships"`);
    await queryRunner.query(`DROP INDEX "IDX_963693341bd612aa01ddf3a4b6"`);
    await queryRunner.query(`DROP TABLE "organizations"`);
    await queryRunner.query(`DROP INDEX "IDX_a87cf0659c3ac379b339acf36a"`);
    await queryRunner.query(`DROP TABLE "roles"`);
    await queryRunner.query(`DROP TYPE "roles_scope_enum"`);
    await queryRunner.query(`DROP INDEX "IDX_15fa22bd36bffef8124011ace0"`);
    await queryRunner.query(`DROP INDEX "IDX_3928a3152cb3121f5a9b9dd0aa"`);
    await queryRunner.query(`DROP TABLE "refresh_token_sessions"`);
    await queryRunner.query(`DROP INDEX "IDX_97672ac88f789774dd47f7c8be"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
