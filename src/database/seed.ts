import 'reflect-metadata';
import { AppDataSource } from './data-source';
import { RoleEntity, RoleScope } from '../modules/shared/entities/role.entity';
import { PermissionEntity } from '../modules/shared/entities/permission.entity';
import { RolePermissionEntity } from '../modules/shared/entities/role-permission.entity';
import { GlobalRole } from '../modules/shared/enums/global-role.enum';
import { OrganizationRole } from '../modules/shared/enums/organization-role.enum';
import { Permissions } from '../modules/shared/constants/permissions';

async function seed() {
  await AppDataSource.initialize();
  console.log('🌱 Starting database seed...');

  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const roleRepo = queryRunner.manager.getRepository(RoleEntity);
    const permRepo = queryRunner.manager.getRepository(PermissionEntity);
    const rolePermRepo =
      queryRunner.manager.getRepository(RolePermissionEntity);

    // 1. Seed Roles
    console.log('Seeding roles...');
    const rolesToSeed = [
      {
        key: GlobalRole.PLATFORM_ADMIN,
        name: 'Platform Admin',
        scope: RoleScope.GLOBAL,
      },
      {
        key: OrganizationRole.PROPERTY_MANAGER,
        name: 'Property Manager',
        scope: RoleScope.ORGANIZATION,
      },
      {
        key: OrganizationRole.TENANT,
        name: 'Tenant',
        scope: RoleScope.ORGANIZATION,
      },
      {
        key: OrganizationRole.VIEWER,
        name: 'Viewer',
        scope: RoleScope.ORGANIZATION,
      },
    ];

    const rolesMap = new Map<string, RoleEntity>();
    for (const r of rolesToSeed) {
      let role = await roleRepo.findOne({ where: { key: r.key } });
      if (!role) {
        role = roleRepo.create(r);
        await roleRepo.save(role);
      }
      rolesMap.set(r.key, role);
    }

    // 2. Seed Permissions
    console.log('Seeding permissions...');
    const permsToSeed = Object.values(Permissions).map((key) => ({
      key,
      description: `Permission to ${key.replace('.', ' ')}`,
    }));

    const permsMap = new Map<string, PermissionEntity>();
    for (const p of permsToSeed) {
      let perm = await permRepo.findOne({ where: { key: p.key } });
      if (!perm) {
        perm = permRepo.create(p);
        await permRepo.save(perm);
      }
      permsMap.set(p.key, perm);
    }

    // 3. Map Permissions to Roles
    console.log('Mapping permissions to roles...');

    // Platform Admin gets everything
    const adminRole = rolesMap.get(GlobalRole.PLATFORM_ADMIN)!;
    for (const perm of permsMap.values()) {
      const exists = await rolePermRepo.findOne({
        where: { roleId: adminRole.id, permissionId: perm.id },
      });
      if (!exists) {
        await rolePermRepo.save(
          rolePermRepo.create({ role: adminRole, permission: perm }),
        );
      }
    }

    // Property Manager gets organization stuff
    const pmRole = rolesMap.get(OrganizationRole.PROPERTY_MANAGER)!;
    const pmPermKeys = [
      Permissions.ORGANIZATIONS_READ,
      Permissions.ORGANIZATIONS_MANAGE,
      Permissions.PROPERTIES_READ,
      Permissions.PROPERTIES_MANAGE,
      Permissions.LEASES_READ,
      Permissions.LEASES_MANAGE,
      Permissions.PAYMENTS_READ,
      Permissions.PAYMENTS_MANAGE,
    ];
    for (const key of pmPermKeys) {
      const perm = permsMap.get(key)!;
      const exists = await rolePermRepo.findOne({
        where: { roleId: pmRole.id, permissionId: perm.id },
      });
      if (!exists) {
        await rolePermRepo.save(
          rolePermRepo.create({ role: pmRole, permission: perm }),
        );
      }
    }

    // Tenant gets read-only to their stuff
    const tenantRole = rolesMap.get(OrganizationRole.TENANT)!;
    const tenantPermKeys = [
      Permissions.ORGANIZATIONS_READ,
      Permissions.PROPERTIES_READ,
      Permissions.LEASES_READ,
      Permissions.PAYMENTS_READ,
    ];
    for (const key of tenantPermKeys) {
      const perm = permsMap.get(key)!;
      const exists = await rolePermRepo.findOne({
        where: { roleId: tenantRole.id, permissionId: perm.id },
      });
      if (!exists) {
        await rolePermRepo.save(
          rolePermRepo.create({ role: tenantRole, permission: perm }),
        );
      }
    }

    // Viewer gets read-only
    const viewerRole = rolesMap.get(OrganizationRole.VIEWER)!;
    const viewerPermKeys = [
      Permissions.ORGANIZATIONS_READ,
      Permissions.PROPERTIES_READ,
    ];
    for (const key of viewerPermKeys) {
      const perm = permsMap.get(key)!;
      const exists = await rolePermRepo.findOne({
        where: { roleId: viewerRole.id, permissionId: perm.id },
      });
      if (!exists) {
        await rolePermRepo.save(
          rolePermRepo.create({ role: viewerRole, permission: perm }),
        );
      }
    }

    await queryRunner.commitTransaction();
    console.log('✅ Seed completed successfully!');
  } catch (err) {
    console.error('❌ Seed failed:', err);
    await queryRunner.rollbackTransaction();
    process.exit(1);
  } finally {
    await queryRunner.release();
    await AppDataSource.destroy();
  }
}

seed();
