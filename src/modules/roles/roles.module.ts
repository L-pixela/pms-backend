import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationMembershipRoleEntity } from '../organizations/entities/organization-membership-role.entity';
import { OrganizationMembershipEntity } from '../organizations/entities/organization-membership.entity';
import { OrganizationEntity } from '../organizations/entities/organization.entity';
import { RolePermissionEntity } from '../shared/entities/role-permission.entity';
import { RoleEntity } from '../shared/entities/role.entity';
import { SharedModule } from '../shared/shared.module';
import { UserGlobalRoleEntity } from '../users/entities/user-global-role.entity';
import { UserEntity } from '../users/entities/user.entity';
import { OrganizationRolesController } from './organization-roles.controller';
import {
  MemberRolesController,
  UserRolesController,
} from './role-assignments.controller';
import { RoleAssignmentsService } from './role-assignments.service';
import { PermissionsController, RolesController } from './roles.controller';
import { RolesService } from './roles.service';

@Module({
  imports: [
    SharedModule,
    TypeOrmModule.forFeature([
      RoleEntity,
      RolePermissionEntity,
      OrganizationEntity,
      OrganizationMembershipEntity,
      OrganizationMembershipRoleEntity,
      UserEntity,
      UserGlobalRoleEntity,
    ]),
  ],
  controllers: [
    PermissionsController,
    RolesController,
    OrganizationRolesController,
    UserRolesController,
    MemberRolesController,
  ],
  providers: [RolesService, RoleAssignmentsService],
  exports: [RoleAssignmentsService],
})
export class RolesModule {}
