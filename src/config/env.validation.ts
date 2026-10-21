import 'reflect-metadata';
import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

const PRODUCTION_SECRET_MIN_LENGTH = 32;

export class EnvironmentVariables {
  @IsIn(['development', 'production', 'test'])
  NODE_ENV: 'development' | 'production' | 'test' = 'development';

  @IsInt()
  @Min(1)
  PORT: number = 3000;

  // Implicit conversion would turn the string 'false' into true.
  @Transform(({ obj }: { obj: Record<string, unknown> }) => {
    const value = obj.SWAGGER_ENABLED;
    return typeof value === 'string' ? value.toLowerCase() === 'true' : value;
  })
  @IsBoolean()
  SWAGGER_ENABLED: boolean = false;

  @IsString()
  @IsNotEmpty()
  JWT_ACCESS_SECRET: string;

  @IsString()
  @IsNotEmpty()
  JWT_REFRESH_SECRET: string;

  @IsInt()
  @Min(1)
  JWT_ACCESS_EXPIRES_IN_SECONDS: number = 900;

  @IsInt()
  @Min(1)
  JWT_REFRESH_EXPIRES_IN_SECONDS: number = 604800;

  @IsString()
  DB_HOST: string = 'localhost';

  @IsInt()
  @Min(1)
  DB_PORT: number = 5432;

  @IsString()
  DB_USERNAME: string = 'rental_user';

  @IsString()
  DB_PASSWORD: string = 'rental_pass';

  @IsString()
  DB_NAME: string = 'rental_db';

  @IsOptional()
  @IsEmail()
  SEED_ADMIN_EMAIL?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  SEED_ADMIN_PASSWORD?: string;
}

export function validate(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const env = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(env, { skipMissingProperties: false }).flatMap(
    (error) => Object.values(error.constraints ?? {}),
  );

  if (env.NODE_ENV === 'production') {
    for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
      if ((env[key]?.length ?? 0) < PRODUCTION_SECRET_MIN_LENGTH) {
        errors.push(
          `${key} must be at least ${PRODUCTION_SECRET_MIN_LENGTH} characters in production`,
        );
      }
    }
    if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
      errors.push('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ');
    }
  }

  if (errors.length) {
    throw new Error(
      `Invalid environment configuration:\n- ${errors.join('\n- ')}`,
    );
  }

  return env;
}
