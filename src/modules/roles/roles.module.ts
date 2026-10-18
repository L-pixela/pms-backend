import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { OrganizationRolesController } from './organization-roles.controller';
import {
  MemberRolesController,
  UserRolesController,
} from './role-assignments.controller';
import { RoleAssignmentsService } from './role-assignments.service';
import { PermissionsController, RolesController } from './roles.controller';
import { RolesService } from './roles.service';

@Module({
  imports: [SharedModule],
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
