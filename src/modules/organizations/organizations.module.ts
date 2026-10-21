import { Module } from '@nestjs/common';
import { RolesModule } from '../roles/roles.module';
import { SharedModule } from '../shared/shared.module';
import { OrganizationMembersController } from './organization-members.controller';
import { OrganizationMembersService } from './organization-members.service';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

@Module({
  imports: [SharedModule, RolesModule],
  controllers: [OrganizationsController, OrganizationMembersController],
  providers: [OrganizationsService, OrganizationMembersService],
})
export class OrganizationsModule {}
