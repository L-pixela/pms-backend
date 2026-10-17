import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';

// Load .env so this file works standalone (TypeORM CLI, seed scripts)
config();

import { validate } from '../config/env.validation';
import { ALL_ENTITIES } from './entities';

export const env = validate(process.env);

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: env.DB_HOST,
  port: env.DB_PORT,
  username: env.DB_USERNAME,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  synchronize: false,
  logging: env.NODE_ENV !== 'production',
  entities: ALL_ENTITIES,
  migrations: ['src/database/migrations/*.ts'],
});
