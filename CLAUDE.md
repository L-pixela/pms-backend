# CLAUDE.md

Multi-tenant property rental management REST API. Organizations (landlords and property management companies) manage properties, leases and payments. Users belong to organizations and hold roles scoped to each organization.

This is an early-stage project. Only auth and a stub users module exist. The roadmap is in `IMPLEMENTATION_PLAN.md` (Phases 0–8) and progress is tracked in `TRACKING.md`. Read both before starting a new feature.

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
cp .env.example .env          # JWT secrets, token TTLs, DB credentials
docker compose up -d          # postgres:16 on 5432, pgAdmin on http://localhost:5050 (admin@local.dev / admin)
npm install
npm run migration:run         # see Known errors #8: no migrations exist yet
npm run seed                  # seeds roles, permissions and the role→permission mapping
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

The TypeORM CLI uses `src/database/data-source.ts`, which loads `.env` itself through `dotenv`. The app uses `TypeOrmModule.forRootAsync` in `app.module.ts`. These are **two separate DB configs** that read the same env vars, so change both together.

## Layout

```
src/
  main.ts                 bootstrap + global ValidationPipe (whitelist, transform, forbidUnknownValues)
  app.module.ts           Config, TypeORM, AuthModule, UsersModule; RolesGuard + PermissionsGuard as APP_GUARD
  auth/                   login / refresh / logout, JwtStrategy, JwtAuthGuard, DTOs, RefreshTokenSessionEntity
  database/
    data-source.ts        standalone DataSource for the CLI and seed
    entities.ts           ALL_ENTITIES registry (used by both configs)
    seed.ts               idempotent seed of roles, permissions and role_permissions
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
  - Protect a route with `@UseGuards(JwtAuthGuard)` plus `@RequireRoles({ global: [...], organization: [...] })` and/or `@RequirePermissions(...)`.
  - Org-scoped role checks resolve the org from the `x-organization-id` header, falling back to the `:organizationId` route param.
  - Read the caller with `@CurrentUser()` or `@CurrentUser('id')`, which returns the `AuthenticatedUser` built from JWT claims in `JwtStrategy.validate`.
- **Config** comes from `ConfigService.get(...)`. Numeric env vars are parsed with `Number(...)` and guarded with `Number.isFinite`.
- **Imports** use relative paths. There are no path aliases despite `tsconfig-paths`. Use `import type` for interface- and type-only imports.

## Features (current state)

| Area | Status |
|---|---|
| `POST /auth/login` | Stub: issues tokens from **client-supplied** identity and roles, with no password check |
| `POST /auth/refresh` | Rotates the refresh token. Sessions are held in an in-memory `Map` |
| `POST /auth/logout` | Deletes the in-memory session |
| `GET /users/me` | Returns the JWT claims |
| `GET /users` | `platform_admin` + `users.read`. Returns an empty stub |
| DB schema | 9 entities defined, but **no migrations** |
| Seed | Roles, 10 permissions and the mapping (works once tables exist) |
| Organizations, properties, leases, payments | Not started (Phases 3–6) |

Access tokens are signed with `JWT_ACCESS_SECRET` (default 900s) and refresh tokens with `JWT_REFRESH_SECRET` (default 604800s). Both token types carry `tokenType` (`access` / `refresh`). Refresh tokens also carry `sessionId`.

## Known errors

Found by code review. Fix these before building features on top of them, and remove each entry once it is fixed.

1. **Login has no credential check (critical).** `src/auth/auth.service.ts:22` signs whatever `userId`, `email`, `globalRoles`, `organizationRoles` and `permissions` the caller sends, so anyone can mint a `platform_admin` token. `passwordHash` and `bcrypt` are unused. (Plan Phase 1.)
2. **Guard order breaks every protected route.** Global `APP_GUARD`s (`RolesGuard`, `PermissionsGuard`) run *before* controller-level `@UseGuards(JwtAuthGuard)`, so `request.user` is still undefined and `@RequireRoles`/`@RequirePermissions` routes always return 401 (for example `GET /users`). The lifecycle diagram in `TRACKING.md` is wrong on this point. Fix it by registering `JwtAuthGuard` as the first `APP_GUARD` with an `@Public()` opt-out, or by moving the RBAC guards into `@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)`.
3. **Cross-tenant role check.** `src/modules/shared/guards/roles.guard.ts:50` prefers the `x-organization-id` header over the `:organizationId` route param, so a caller can authorize against org A while acting on org B. Use the route param when it is present, or reject a mismatch.
4. **Prototype-key lookup.** At `roles.guard.ts:57`, `user.organizationRoles[organizationId]` on an untrusted header (e.g. `constructor`) returns a non-array, and `.includes` then throws a 500. Use `Object.hasOwn` or a `Map`.
5. **Logout returns 500 on a bad token.** `auth.service.ts:84` calls `verifyAsync` without try/catch and never checks `tokenType`, unlike `refresh`.
6. **Refresh sessions are in memory.** At `auth.service.ts:15`, the `Map` is lost on restart, not shared across instances, and never pruned, so memory grows without bound. `RefreshTokenSessionEntity` exists but is unused.
7. **Stale privileges on refresh.** `auth.service.ts:69` copies roles and permissions from the old refresh token instead of reloading them from the DB, so a revoked role keeps being renewed indefinitely.
8. **No migrations.** `synchronize: false`, `src/database/migrations/` does not exist, and `AppModule` sets `migrations: []`. On a fresh DB, `npm run seed` fails with `relation "roles" does not exist`. Generate an `InitialSchema` migration first.
9. **Hardcoded JWT secret fallbacks.** `'dev_access_secret'` / `'dev_refresh_secret'` are used when env vars are missing, and this fallback plus the TTL parsing is duplicated in `auth.module.ts:23`, `jwt.strategy.ts:12` and `auth.service.ts:42/81/107`. Centralize it in one validated config (e.g. `ConfigModule` `validate`) and fail fast in production.
10. **Seed cleanup.** `process.exit(1)` in the catch block at `src/database/seed.ts:126` skips `finally`, and the top-level `seed()` call is not awaited or caught, so a DB-down failure becomes an unhandled rejection.

Minor issues:
- `dotenv` is imported in `data-source.ts` but is not a direct dependency. It only resolves transitively through `@nestjs/config`.
- `README.md` is the unmodified Nest starter.
- No tests exist beyond the generated `app.controller.spec.ts` and `test/app.e2e-spec.ts`.
