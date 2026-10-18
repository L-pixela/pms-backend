# CLAUDE.md

Multi-tenant property rental management REST API. Organizations (landlords and property management companies) manage properties, leases and payments. Users belong to organizations and hold roles scoped to each organization.

This is an early-stage project. Auth, DB-backed RBAC (dynamic roles, role management API) and a stub users module exist. The roadmap is in `IMPLEMENTATION_PLAN.md` (Phases 0–8) and progress is tracked in `TRACKING.md`. Read both before starting a new feature.

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
npm run migration:run         # creates the schema (InitialSchema, DynamicRoles)
npm run seed                  # permission catalog, system roles (synced exactly to code), and a platform_admin
                              # from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD when both are set
npm run start:dev             # http://localhost:3000
```

| Task | Command |
|---|---|
| Build | `npm run build` |
| Lint (auto-fixes, includes Prettier) | `npm run lint` |
| Lint without fixing (used by CI) | `npm run lint:check` |
| Format | `npm run format` |
| Check formatting without writing | `npm run format:check` |
| Unit tests (`src/**/*.spec.ts`) | `npm test` |
| E2E tests (`test/`) | `npm run test:e2e` |
| Generate a migration | `npm run migration:generate -- src/database/migrations/<Name>` |
| Revert the last migration | `npm run migration:revert` |

The TypeORM CLI uses `src/database/data-source.ts`, which loads `.env` itself through `dotenv` and validates it with the same `validate()` as the app. The app uses `TypeOrmModule.forRootAsync` in `app.module.ts`. These are **two separate DB configs** that read the same env vars, so change both together.

## Layout

```
src/
  main.ts                 bootstrap + global ValidationPipe (whitelist, transform, forbidUnknownValues)
  app.module.ts           Config (validated), TypeORM, SharedModule, AuthModule, RolesModule, UsersModule;
                          APP_GUARDs in order: JwtAuthGuard → PermissionsGuard
  config/env.validation.ts  EnvironmentVariables class + validate(); the single source of env defaults
  auth/                   register / login / refresh / logout, JwtStrategy, JwtAuthGuard, DTOs,
                          domain/ (RefreshTokenSession), repositories/ (session port).
                          Tokens carry identity only (no roles/permissions)
  database/
    data-source.ts        standalone DataSource for the CLI and seed
    entities.ts           ALL_ENTITIES registry (used by both configs)
    errors.ts             DuplicateKeyError (DB-agnostic)
    repository.interface.ts  generic IRepository<T, ID> (findById / exists / delete)
    typeorm/              the ONLY place TypeORM is allowed: entities/ (all *Entity classes), mappers.ts,
                          repositories/ (BaseTypeOrmRepository + one TypeOrm*Repository per port),
                          postgres-errors.ts, typeorm-database.module.ts (@Global: forRootAsync,
                          forFeature, token bindings)
    migrations/           TypeORM migrations (InitialSchema, DynamicRoles)
    seed.ts               idempotent seed of permissions, system roles + their permissions, and the admin user
  test-utils/             helpers for unit tests (fake ExecutionContext)
  modules/
    shared/               cross-cutting RBAC: SharedModule (AccessControlService), constants/permissions.ts
                          (catalog), constants/system-roles.ts, decorators, PermissionsGuard, organization-context.ts,
                          domain/role.ts (Role, RoleScope), repositories/ (role + permission ports),
                          AuthenticatedUser interface
    roles/                RolesModule (repositories/: role-assignment port): /permissions, /roles, /organizations/:organizationId/roles,
                          user + member role assignment (RolesService, RoleAssignmentsService)
    users/                UsersController (/users/me, /users/me/permissions, /users), UsersService, domain/user.ts, repositories/ (user port)
    organizations/        domain models + repository ports (Organization, Membership), no module yet
```

## Code patterns

- **Feature modules** live in `src/modules/<feature>/` with `<feature>.module.ts`, `.controller.ts`, `.service.ts`, `entities/` and `dto/`. Auth is the exception and lives in `src/auth/`.
- **Persistence is behind repository interfaces.** Services (and everything outside `src/database/`) depend on
  `I*Repository` interfaces and plain domain models, never on TypeORM, `@nestjs/typeorm` or a `*Entity` class.
  ESLint (`no-restricted-imports`) enforces this. For a new aggregate:
  1. Domain model: plain interface in `modules/<feature>/domain/`.
  2. Port: `modules/<feature>/repositories/<name>.repository.interface.ts` with `I<Name>Repository`
     (extend `IRepository<T>` when it has a single `id`) and a `Symbol` token (`<NAME>_REPOSITORY`).
     Name methods for intent (`findVisibleToOrganization`), not `find(where)`.
  3. Implementation: `TypeOrm<Name>Repository` in `src/database/typeorm/repositories/` (extend
     `BaseTypeOrmRepository<Entity, Domain>`, map with `mappers.ts`, translate unique violations into
     `DuplicateKeyError`). Keep transactions inside repository methods.
  4. Bind the token in `TypeOrmDatabaseModule` and export it.
  5. Inject with `@Inject(TOKEN) private readonly x: IXRepository` and catch `DuplicateKeyError`, not driver errors.
  Unit-test services with `jest.Mocked<IXRepository>`.
- **Entities** live in `src/database/typeorm/entities/` and use the `*Entity` class suffix, a plural snake_case table name (`@Entity({ name: 'organization_memberships' })`), `uuid` primary keys, snake_case column names through `name:` on camelCase properties, `timestamptz` `createdAt`/`updatedAt`, and an explicit `*Id` FK column next to the `@ManyToOne` + `@JoinColumn` relation. **Register every new entity in `src/database/entities.ts`.**
- **DTOs** are classes with `class-validator` decorators. Use `@ValidateNested` + `@Type(() => X)` for nested objects. The global pipe strips unknown properties, so every accepted field needs a decorator.
- **RBAC** (details in `TRACKING.md` → Authorization Model):
  - Authorize **only** with `@RequirePermissions(...)` (all listed are required). Never check a role key in code: roles are data that admins and orgs create at runtime.
  - Permission strings are `<resource>.<read|manage>` and are defined only in `PERMISSION_CATALOG` in `modules/shared/constants/permissions.ts`, with the role scopes (`global` / `organization`) each may be held by. Run `npm run seed` after adding one; add it to a system role in `constants/system-roles.ts` if a built-in role should have it.
  - Roles: platform roles (`organization_id NULL`, `scope` global or organization = template for every org) and custom org roles (`organization_id` set). `is_system` roles belong to the seed and are read-only through the API.
  - Effective permissions are loaded from the DB on every guarded request (`AccessControlService.getEffectivePermissions`): global-role permissions, plus the caller's roles in the org of the `:organizationId` route param. There is no header fallback. **Org-scoped routes must name the param exactly `:organizationId`.**
  - Role writes and assignments go through `AccessControlService.assertHoldsAll` (no granting or revoking permissions the caller lacks). Keep that for any new endpoint that changes roles.
  - The guard authorizes; it does not isolate data. Services must still filter every query by `organizationId`.
  - Every route requires a valid access token by default (global `JwtAuthGuard`). Opt out with `@Public()` (`modules/shared/decorators/public.decorator.ts`). Do not add `@UseGuards(JwtAuthGuard)`.
  - Read the caller with `@CurrentUser()` / `@CurrentUser('id')` (`AuthenticatedUser` = `{ id, email }`).
- **Config**: declare every env var (type, validators, default) in `src/config/env.validation.ts` and add it to `.env.example`. Read it with `configService.getOrThrow<T>(...)`; numbers are already parsed. Never add inline `??` fallbacks. In production, JWT secrets must be ≥32 chars and distinct or the app refuses to boot.
- **Imports** use relative paths. There are no path aliases despite `tsconfig-paths`. Use `import type` for interface- and type-only imports.

## Features (current state)

| Area | Status |
|---|---|
| `POST /auth/register` | Public. `email` + `password` (8–72 chars), bcrypt. 409 on duplicate email. Returns `{ id, email }`, no tokens |
| `POST /auth/login` | Public. `email` + `password`; rejects inactive users |
| `POST /auth/refresh` | Public. Rotates the session in `refresh_token_sessions` (single-use); rejects inactive users |
| `POST /auth/logout` | Public. Sets `revoked_at` on the session |
| `GET /users/me` | Authenticated. Identity, global roles, roles per organization |
| `GET /users/me/permissions` | Authenticated. Effective permissions, optionally `?organizationId=` |
| `GET /users` | `users.read`. Returns an empty stub |
| `GET /permissions` | Authenticated. Permission catalog with allowed scopes |
| `/roles` CRUD, `GET/PUT /users/:userId/roles` | `roles.read` / `roles.manage` (global) |
| `/organizations/:organizationId/roles` CRUD, `GET/PUT .../members/:userId/roles` | `roles.read` / `roles.manage` in that org |
| DB schema | 9 entities; `InitialSchema` + `DynamicRoles` migrations, verified against Postgres 16 |
| Seed | 12 permissions, 4 system roles (`platform_admin`, `property_manager`, `tenant`, `viewer`), optional admin |
| Tests | Unit specs for `PermissionsGuard`, `JwtAuthGuard`, `AuthService`, `RolesService` (repositories mocked); e2e auth + RBAC (needs a migrated + seeded DB) |
| Organizations (CRUD, members), properties, leases, payments | Not started (Phases 3–6). Memberships exist only as rows for now |

Access tokens are signed with `JWT_ACCESS_SECRET` (default 900s) and carry only `sub` and `email`. Refresh tokens are signed with `JWT_REFRESH_SECRET` (default 604800s) and carry only `sub` and `sessionId`. Both carry `tokenType` (`access` / `refresh`), which `JwtStrategy` and `AuthService` check. Sessions store a SHA-256 hash of the refresh token (not bcrypt: it truncates at 72 bytes).

## Known errors

Found by code review. Fix these before building features on top of them, and remove each entry once it is fixed.

Minor issues:
- `README.md` is the unmodified Nest starter.
