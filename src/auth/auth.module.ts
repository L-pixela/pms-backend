import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationMembershipRoleEntity } from '../modules/organizations/entities/organization-membership-role.entity';
import { RolePermissionEntity } from '../modules/shared/entities/role-permission.entity';
import { UserGlobalRoleEntity } from '../modules/users/entities/user-global-role.entity';
import { UserEntity } from '../modules/users/entities/user.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RefreshTokenSessionEntity } from './entities/refresh-token-session.entity';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UserClaimsService } from './user-claims.service';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    TypeOrmModule.forFeature([
      UserEntity,
      UserGlobalRoleEntity,
      OrganizationMembershipRoleEntity,
      RolePermissionEntity,
      RefreshTokenSessionEntity,
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: {
          expiresIn: configService.getOrThrow<number>(
            'JWT_ACCESS_EXPIRES_IN_SECONDS',
          ),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, UserClaimsService, JwtStrategy],
  exports: [AuthService, PassportModule, JwtModule],
})
export class AuthModule {}
