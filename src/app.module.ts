import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { validate } from './config/env.validation';
import { TypeOrmDatabaseModule } from './database/typeorm/typeorm-database.module';
import { RolesModule } from './modules/roles/roles.module';
import { PermissionsGuard } from './modules/shared/guards/permissions.guard';
import { SharedModule } from './modules/shared/shared.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate }),
    TypeOrmDatabaseModule,
    SharedModule,
    AuthModule,
    RolesModule,
    UsersModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global guards run in registration order: authenticate first, then
    // authorize. Opt a route out of authentication with @Public().
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
})
export class AppModule {}
