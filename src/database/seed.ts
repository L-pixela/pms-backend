import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import { In, IsNull, Not, type QueryRunner } from 'typeorm';
import { AppDataSource, env } from './data-source';
import { RoleEntity } from '../modules/shared/entities/role.entity';
import { PermissionEntity } from '../modules/shared/entities/permission.entity';
import { RolePermissionEntity } from '../modules/shared/entities/role-permission.entity';
import {
  isAssignableToScope,
  PERMISSION_CATALOG,
} from '../modules/shared/constants/permissions';
import {
  SYSTEM_ROLE_DEFINITIONS,
  SystemRoles,
} from '../modules/shared/constants/system-roles';
import { UserEntity } from '../modules/users/entities/user.entity';
import { UserGlobalRoleEntity } from '../modules/users/entities/user-global-role.entity';

const BCRYPT_COST = 12;

async function seed() {
  let queryRunner: QueryRunner | undefined;

  try {
    await AppDataSource.initialize();
    console.log('🌱 Starting database seed...');

    queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const roleRepo = queryRunner.manager.getRepository(RoleEntity);
    const permRepo = queryRunner.manager.getRepository(PermissionEntity);
    const rolePermRepo =
      queryRunner.manager.getRepository(RolePermissionEntity);

    // 1. Permissions: one row per entry in the code catalog.
    console.log('Seeding permissions...');
    const permsMap = new Map<string, PermissionEntity>();
    for (const [key, { description }] of Object.entries(PERMISSION_CATALOG)) {
      let perm = await permRepo.findOne({ where: { key } });
      if (!perm) {
        perm = permRepo.create({ key, description });
      }
      perm.description = description;
      permsMap.set(key, await permRepo.save(perm));
    }

    // 2. System roles: created, and their permissions set exactly as defined
    //    in code. They are read-only through the API, so this never
    //    overwrites an admin's edits.
    console.log('Syncing system roles...');
    const rolesMap = new Map<string, RoleEntity>();
    for (const definition of SYSTEM_ROLE_DEFINITIONS) {
      for (const permission of definition.permissions) {
        if (!isAssignableToScope(permission, definition.scope)) {
          throw new Error(
            `System role "${definition.key}" cannot hold "${permission}" (${definition.scope} scope).`,
          );
        }
      }

      let role = await roleRepo.findOne({
        where: { key: definition.key, organizationId: IsNull() },
      });
      if (!role) {
        role = roleRepo.create({ key: definition.key, organizationId: null });
      }
      role.name = definition.name;
      role.description = definition.description;
      role.scope = definition.scope;
      role.isSystem = true;
      role = await roleRepo.save(role);
      rolesMap.set(definition.key, role);

      const wanted = definition.permissions.map((key) => permsMap.get(key)!.id);
      await rolePermRepo.delete({
        roleId: role.id,
        ...(wanted.length && { permissionId: Not(In(wanted)) }),
      });
      for (const permissionId of wanted) {
        const exists = await rolePermRepo.exists({
          where: { roleId: role.id, permissionId },
        });
        if (!exists) {
          await rolePermRepo.insert({ roleId: role.id, permissionId });
        }
      }
    }

    // 3. Seed the platform admin user (optional)
    const adminRole = rolesMap.get(SystemRoles.PLATFORM_ADMIN)!;
    if (env.SEED_ADMIN_EMAIL && env.SEED_ADMIN_PASSWORD) {
      console.log('Seeding platform admin user...');
      const userRepo = queryRunner.manager.getRepository(UserEntity);
      const userRoleRepo =
        queryRunner.manager.getRepository(UserGlobalRoleEntity);
      const email = env.SEED_ADMIN_EMAIL.trim().toLowerCase();

      let admin = await userRepo.findOne({ where: { email } });
      if (!admin) {
        admin = await userRepo.save(
          userRepo.create({
            email,
            passwordHash: await bcrypt.hash(
              env.SEED_ADMIN_PASSWORD,
              BCRYPT_COST,
            ),
            isActive: true,
          }),
        );
      }

      const exists = await userRoleRepo.findOne({
        where: { userId: admin.id, roleId: adminRole.id },
      });
      if (!exists) {
        await userRoleRepo.save(
          userRoleRepo.create({ userId: admin.id, roleId: adminRole.id }),
        );
      }
    } else {
      console.log(
        'Skipping platform admin user (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set).',
      );
    }

    await queryRunner.commitTransaction();
    console.log('✅ Seed completed successfully!');
  } catch (err) {
    if (queryRunner?.isTransactionActive) {
      await queryRunner.rollbackTransaction();
    }
    throw err;
  } finally {
    await queryRunner?.release();
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exitCode = 1;
});
