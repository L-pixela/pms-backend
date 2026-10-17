# CLAUDE.md

Multi-tenant property rental management REST API. Organizations (landlords and property management companies) manage properties, leases and payments. Users belong to organizations and hold roles scoped to each organization.

This is an early-stage project. Only auth (DB-backed) and a stub users module exist. The roadmap is in `IMPLEMENTATION_PLAN.md` (Phases 0–8) and progress is tracked in `TRACKING.md`. Read both before starting a new feature.

## Stack

- NestJS 11 on Express, TypeScript 5
- TypeORM 0.3 with PostgreSQL 16 (`pg`)
- Passport JWT (`passport-jwt`, `@nestjs/jwt`) for auth
- `class-validator` and `class-transformer` for validation
- `@nestjs/config`, which reads `.env`
- Jest and Supertest for tests
- Prettier with `singleQuote` and `trailingComma: all`, plus ESLint 9 flat config

## Setup and commands

```bash
cp .env.example .env          # JWT secrets, token TTLs, DB credentials, seed admin
docker compose up -d          # postgres:16 on 5432, pgAdmin on http://localhost:5050 (admin@local.dev / admin)
npm install
npm run migration:run         # creates the schema (InitialSchema)
npm run seed                  # roles, permissions, role→permission mapping, and a platform_admin
                              # from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD when both are set
npm run start:dev             # http://localhost:3000
```

| Task | Command |
|---|---|
| Build | `npm run build` |
| Lint (auto-fixes) | `npm run lint` |
| Format | `npm run format` |
| Unit tests (`src/**/*.spec.ts`) | `npm test` |
| E2E tests (`test/`) | `npm run test:e2e` |
| Generate a migration | `npm run migration:generate -- src/database/migrations/<Name>` |
| Revert the last migration | `npm run migration:revert` |

The TypeORM CLI uses `src/database/data-source.ts`, which loads `.env` itself through `dotenv` and validates it with the same `validate()` as the app. The app uses `TypeOrmModule.forRootAsync` in `app.module.ts`. These are **two separate DB configs** that read the same env vars, so change both together.

## Layout

```
src/
  main.ts                 bootstrap + global ValidationPipe (whitelist, transform, forbidUnknownValues)
  app.module.ts           Config (validated), TypeORM, AuthModule, UsersModule;
                          APP_GUARDs in order: JwtAuthGuard → RolesGuard → PermissionsGuard
  config/env.validation.ts  EnvironmentVariables class + validate(); the single source of env defaults
  auth/                   register / login / refresh / logout, UserClaimsService (roles+permissions from DB),
                          JwtStrategy, JwtAuthGuard, DTOs, RefreshTokenSessionEntity
  database/
    data-source.ts        standalone DataSource for the CLI and seed
    entities.ts           ALL_ENTITIES registry (used by both configs)
    migrations/           TypeORM migrations (InitialSchema)
    seed.ts               idempotent seed of roles, permissions, role_permissions and the admin user
  test-utils/             helpers for unit tests (fake ExecutionContext)
  modules/
    shared/               cross-cutting RBAC: constants/permissions.ts, enums, decorators, guards,
                          Role / Permission / RolePermission entities, AuthenticatedUser interface
    users/                UsersController (/users/me, /users), UsersService (stub), User + UserGlobalRole entities
    organizations/        entities only (Organization, Membership, MembershipRole), no module yet
```

## Code patterns

- **Feature modules** live in `src/modules/<feature>/` with `<feature>.module.ts`, `.controller.ts`, `.service.ts`, `entities/` and `dto/`. Auth is the exception and lives in `src/auth/`.
- **Entities** use the `*Entity` class suffix, a plural snake_case table name (`@Entity({ name: 'organization_memberships' })`), `uuid` primary keys, snake_case column names through `name:` on camelCase properties, `timestamptz` `createdAt`/`updatedAt`, and an explicit `*Id` FK column next to the `@ManyToOne` + `@JoinColumn` relation. **Register every new entity in `src/database/entities.ts`.**
- **DTOs** are classes with `class-validator` decorators. Use `@ValidateNested` + `@Type(() => X)` for nested objects. The global pipe strips unknown properties, so every accepted field needs a decorator.
- **RBAC**:
  - Permission strings are `<resource>.<read|manage>` and are defined only in `modules/shared/constants/permissions.ts` (`Permissions.USERS_READ`). When you add one, also map it to roles in `database/seed.ts`.
  - Roles are the `GlobalRole` enum (`platform_admin`) and the `OrganizationRole` enum (`property_manager`, `tenant`, `viewer`).
  - Every route requires a valid access token by default (global `JwtAuthGuard`). Opt out with `@Public()` (`modules/shared/decorators/public.decorator.ts`). Do not add `@UseGuards(JwtAuthGuard)`.
  - Authorize with `@RequireRoles({ global: [...], organization: [...] })` and/or `@RequirePermissions(...)`.
  - Org-scoped role checks use the `:organizationId` route param when present. The `x-organization-id` header is only a fallback for routes without that param, and a header that disagrees with the param is rejected with 403.
  - Token claims come from the DB (`UserClaimsService`). The flat `permissions` list contains only permissions of **global** roles; org-scoped permission checks are still to be designed (Phase 3).
  - Read the caller with `@CurrentUser()` or `@CurrentUser('id')`, which returns the `AuthenticatedUser` built from JWT claims in `JwtStrategy.validate`.
- **Config**: declare every env var (type, validators, default) in `src/config/env.validation.ts` and add it to `.env.example`. Read it with `configService.getOrThrow<T>(...)`; numbers are already parsed. Never add inline `??` fallbacks. In production, JWT secrets must be ≥32 chars and distinct or the app refuses to boot.
- **Imports** use relative paths. There are no path aliases despite `tsconfig-paths`. Use `import type` for interface- and type-only imports.

## Features (current state)

| Area | Status |
|---|---|
| `POST /auth/register` | Public. `email` + `password` (8–72 chars), bcrypt. 409 on duplicate email. Returns `{ id, email }`, no tokens |
| `POST /auth/login` | Public. `email` + `password`; rejects inactive users. Roles/permissions loaded from the DB |
| `POST /auth/refresh` | Public. Rotates the session in `refresh_token_sessions` (single-use) and reloads claims from the DB |
| `POST /auth/logout` | Public. Sets `revoked_at` on the session |
| `GET /users/me` | Authenticated. Returns the JWT claims |
| `GET /users` | `platform_admin` + `users.read`. Returns an empty stub |
| DB schema | 9 entities, `InitialSchema` migration |
| Seed | Roles, 10 permissions, the mapping, and optional admin user |
| Tests | Unit specs for guards, `AuthService`; e2e auth/RBAC flow (needs a migrated + seeded DB) |
| Organizations, properties, leases, payments | Not started (Phases 3–6) |

Access tokens are signed with `JWT_ACCESS_SECRET` (default 900s) and carry `sub`, `email`, roles and permissions. Refresh tokens are signed with `JWT_REFRESH_SECRET` (default 604800s) and carry only `sub` and `sessionId`. Both carry `tokenType` (`access` / `refresh`), which `JwtStrategy` and `AuthService` check. Sessions store a SHA-256 hash of the refresh token (not bcrypt: it truncates at 72 bytes).

## Known errors

Found by code review. Fix these before building features on top of them, and remove each entry once it is fixed.

Minor issues:
- `README.md` is the unmodified Nest starter.
- `InitialSchema` was rendered offline from entity metadata and has not yet been run against a real database.
