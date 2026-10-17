import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';

// Load .env so this file works standalone (TypeORM CLI, seed scripts)
config();

import { ALL_ENTITIES } from './entities';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME ?? 'rental_user',
  password: process.env.DB_PASSWORD ?? 'rental_pass',
  database: process.env.DB_NAME ?? 'rental_db',
  synchronize: false,
  logging: process.env.NODE_ENV !== 'production',
  entities: ALL_ENTITIES,
  migrations: ['src/database/migrations/*.ts'],
});
