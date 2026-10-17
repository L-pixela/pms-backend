import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AccessTokenPayload } from '../interfaces/token-payload.interface';
import type { AuthenticatedUser } from '../../modules/shared/interfaces/authenticated-user.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  validate(payload: AccessTokenPayload): AuthenticatedUser {
    return {
      id: payload.sub,
      email: payload.email,
      globalRoles: payload.globalRoles,
      organizationRoles: payload.organizationRoles,
      permissions: payload.permissions,
    };
  }
}
