import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { REFRESH_TOKEN_SESSION_REPOSITORY } from '../../auth/repositories/refresh-token-session.repository.interface';
import { MEMBERSHIP_REPOSITORY } from '../../modules/organizations/repositories/membership.repository.interface';
import { ORGANIZATION_REPOSITORY } from '../../modules/organizations/repositories/organization.repository.interface';
import { ROLE_ASSIGNMENT_REPOSITORY } from '../../modules/roles/repositories/role-assignment.repository.interface';
import { PERMISSION_REPOSITORY } from '../../modules/shared/repositories/permission.repository.interface';
import { ROLE_REPOSITORY } from '../../modules/shared/repositories/role.repository.interface';
import { USER_REPOSITORY } from '../../modules/users/repositories/user.repository.interface';
import { ALL_ENTITIES } from '../entities';
import { TypeOrmMembershipRepository } from './repositories/typeorm-membership.repository';
import { TypeOrmOrganizationRepository } from './repositories/typeorm-organization.repository';
import { TypeOrmPermissionRepository } from './repositories/typeorm-permission.repository';
import { TypeOrmRefreshTokenSessionRepository } from './repositories/typeorm-refresh-token-session.repository';
import { TypeOrmRoleAssignmentRepository } from './repositories/typeorm-role-assignment.repository';
import { TypeOrmRoleRepository } from './repositories/typeorm-role.repository';
import { TypeOrmUserRepository } from './repositories/typeorm-user.repository';

const REPOSITORY_BINDINGS = [
  { provide: USER_REPOSITORY, useClass: TypeOrmUserRepository },
  {
    provide: REFRESH_TOKEN_SESSION_REPOSITORY,
    useClass: TypeOrmRefreshTokenSessionRepository,
  },
  { provide: ROLE_REPOSITORY, useClass: TypeOrmRoleRepository },
  {
    provide: ROLE_ASSIGNMENT_REPOSITORY,
    useClass: TypeOrmRoleAssignmentRepository,
  },
  { provide: PERMISSION_REPOSITORY, useClass: TypeOrmPermissionRepository },
  {
    provide: ORGANIZATION_REPOSITORY,
    useClass: TypeOrmOrganizationRepository,
  },
  { provide: MEMBERSHIP_REPOSITORY, useClass: TypeOrmMembershipRepository },
];

/**
 * The only module that knows the persistence technology. To switch databases
 * or ORMs, write another module that binds the same tokens and import it from
 * `AppModule` instead.
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.getOrThrow<string>('DB_HOST'),
        port: configService.getOrThrow<number>('DB_PORT'),
        username: configService.getOrThrow<string>('DB_USERNAME'),
        password: configService.getOrThrow<string>('DB_PASSWORD'),
        database: configService.getOrThrow<string>('DB_NAME'),
        synchronize: false,
        logging: configService.get<string>('NODE_ENV') !== 'production',
        entities: ALL_ENTITIES,
        migrations: [__dirname + '/../migrations/*{.ts,.js}'],
      }),
    }),
    TypeOrmModule.forFeature(ALL_ENTITIES),
  ],
  providers: REPOSITORY_BINDINGS,
  exports: REPOSITORY_BINDINGS.map(({ provide }) => provide),
})
export class TypeOrmDatabaseModule {}
