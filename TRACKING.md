# Rental Management System — Project Tracking

> Last updated: 2026-10-18

---

## Overview

A **multi-tenant property rental management REST API** built with NestJS.
Landlords / property management companies (Organizations) can manage their Properties,
Leases, and Payments. Users belong to Organizations with scoped roles.

---

## Tech Stack

| Layer        | Technology                              |
|--------------|-----------------------------------------|
| Framework    | NestJS 11 (Express platform)            |
| Language     | TypeScript 5                            |
| ORM          | TypeORM 0.3                             |
| Database     | PostgreSQL (`pg`)                       |
| Auth         | Passport.js + `passport-jwt` + `@nestjs/jwt` |
| Validation   | `class-validator` + `class-transformer` |
| Config       | `@nestjs/config` (`.env` based)         |
| Testing      | Jest + Supertest                        |

---

## Architecture

### Request Lifecycle

```
HTTP Request
  │
  ├─► JwtAuthGuard          (global APP_GUARD #1, skipped for @Public() routes)
  │     Validates Bearer access token, populates request.user
  │
  ├─► PermissionsGuard      (global APP_GUARD #2)
  │     Reads @RequirePermissions() metadata
  │     Loads the caller's effective permissions from the DB (AccessControlService):
  │       global-role permissions ∪ (if :organizationId) that org's membership-role permissions
  │     Org = :organizationId route param only (non-UUID → 400); no header
  │
  └─► Controller → Service → Repository → PostgreSQL

Global guards run in registration order (AppModule providers), and all of them
run before any controller-level @UseGuards, which is why JwtAuthGuard must be
global too.
```

### Module Layout

> Persistence: the `entities/` folders below moved to `src/database/typeorm/entities/`. Each feature
> now has `domain/` (plain models) and `repositories/` (`I*Repository` + DI token); the TypeORM
> implementations are in `src/database/typeorm/repositories/` and bound in `TypeOrmDatabaseModule`.

```
src/
├── main.ts                        Bootstrap, global ValidationPipe (whitelist, transform)
├── app.module.ts                  Root module — imports AuthModule, UsersModule
│
├── auth/                          Authentication feature module
│   ├── auth.controller.ts         POST /auth/register, /auth/login, /auth/refresh, /auth/logout (@Public)
│   ├── auth.service.ts            Credential check, token issuance, DB-backed session rotation
│   ├── user-claims.service.ts     Loads roles + permissions from the DB for tokens
│   ├── auth.module.ts             JwtModule (async config), PassportModule
│   ├── dto/
│   │   ├── login.dto.ts           email, password
│   │   ├── register.dto.ts        email, password (8–72 chars)
│   │   └── refresh-token.dto.ts   refreshToken string
│   ├── entities/
│   │   └── refresh-token-session.entity.ts   refresh_token_sessions (SHA-256 token hash)
│   ├── guards/
│   │   └── jwt-auth.guard.ts      Extends AuthGuard('jwt'); honors @Public()
│   ├── interfaces/
│   │   └── token-payload.interface.ts        AccessTokenPayload, RefreshTokenPayload
│   ├── strategies/
│   │   └── jwt.strategy.ts        Reads Bearer token, maps payload → AuthenticatedUser
│   └── types/
│       └── auth-token-response.type.ts
│
└── modules/
    ├── shared/                    Cross-cutting RBAC (SharedModule exports AccessControlService)
    │   ├── constants/
    │   │   ├── permissions.ts     Permissions + PERMISSION_CATALOG (description, allowed role scopes)
    │   │   └── system-roles.ts    SystemRoles keys + SYSTEM_ROLE_DEFINITIONS (seed-owned roles)
    │   ├── decorators/
    │   │   ├── current-user.decorator.ts         @CurrentUser() param decorator
    │   │   ├── public.decorator.ts               @Public(): skip authentication
    │   │   └── require-permissions.decorator.ts   @RequirePermissions(...perms)
    │   ├── entities/
    │   │   ├── role.entity.ts             roles (key, name, description, scope, organization_id, is_system)
    │   │   ├── permission.entity.ts       permissions table (key, description)
    │   │   └── role-permission.entity.ts  role_permissions join table
    │   ├── guards/
    │   │   └── permissions.guard.ts       Global guard — checks DB-resolved permissions
    │   ├── services/
    │   │   └── access-control.service.ts  getEffectivePermissions(), assertHoldsAll() (anti-escalation)
    │   ├── organization-context.ts        resolveOrganizationId(): :organizationId param only
    │   └── interfaces/
    │       └── authenticated-user.interface.ts    Shape of request.user ({ id, email })
    │
    ├── roles/                     Role CRUD + assignments (RolesModule)
    │   ├── roles.controller.ts                GET /permissions, /roles CRUD (platform roles)
    │   ├── organization-roles.controller.ts   /organizations/:organizationId/roles CRUD
    │   ├── role-assignments.controller.ts     PUT/GET user global roles and member roles
    │   ├── roles.service.ts, role-assignments.service.ts
    │   └── dto/
    │
    ├── users/
    │   ├── users.controller.ts    GET /users/me, GET /users/me/permissions, GET /users (admin stub)
    │   ├── users.service.ts       getCurrentUser(), getMyPermissions(), listForAdministration() (stub)
    │   ├── users.module.ts
    │   └── entities/
    │       ├── user.entity.ts             users table
    │       └── user-global-role.entity.ts user_global_roles join table
    │
    ├── organizations/             Entities only — no controller/service/module
    │   └── entities/
    │       ├── organization.entity.ts
    │       ├── organization-membership.entity.ts
    │       └── organization-membership-role.entity.ts
    │
    ├── properties/                Empty placeholder
    ├── leases/                    Empty placeholder
    └── payments/                  Empty placeholder
```

---

## Database Schema (Entities Defined)

```
┌─────────────┐        ┌────────────────────────┐        ┌───────────────┐
│    users    │──────<<│ organization_memberships│>>──────│ organizations │
│─────────────│        │────────────────────────│        │───────────────│
│ id (PK)     │        │ id (PK)                │        │ id (PK)       │
│ email       │        │ user_id (FK)           │        │ slug (UK)     │
│ passwordHash│        │ organization_id (FK)   │        │ name          │
│ isActive    │        └────────────────────────┘        └───────────────┘
└─────────────┘                   │
       │                          │ <<
       │               ┌──────────────────────────────┐
       │               │ organization_membership_roles │
       │               │──────────────────────────────│
       │               │ membership_id (FK)            │──┐
       │               │ role_id (FK)                  │  │
       │               └──────────────────────────────┘  │
       │                                                   │
       │ <<                                                │
┌──────────────────┐      ┌───────────────────────┐       │
│ user_global_roles│      │         roles         │<──────┘
│──────────────────│      │───────────────────────│
│ user_id (FK)     │──────│ id (PK)               │──┐
│ role_id (FK)     │      │ key (UK)              │  │
└──────────────────┘      │ name                  │  │
                          │ scope (global|org)    │  │
                          └───────────────────────┘  │
                                                      │ <<
                          ┌───────────────────────┐   │
                          │    role_permissions   │<──┘
                          │───────────────────────│
                          │ role_id (FK)          │──── roles
                          │ permission_id (FK)    │──┐
                          └───────────────────────┘  │
                                                      │
                          ┌───────────────────────┐   │
                          │     permissions       │<──┘
                          │───────────────────────│
                          │ id (PK)               │
                          │ key (UK)              │
                          │ description           │
                          └───────────────────────┘

┌────────────────────────┐
│ refresh_token_sessions │  (wired to AuthService)
│────────────────────────│
│ id (PK)                │
│ user_id (FK)           │
│ session_id (UK)        │
│ token_hash             │
│ expires_at             │
│ revoked_at (nullable)  │
└────────────────────────┘
```

---

## Authorization Model

Routes check **permissions only** (`@RequirePermissions`); no code checks a role name.
Permissions are fixed in code; roles are data, built from permissions at runtime.

### Roles

| Kind | `organization_id` | `scope` | Managed via | Who can assign it |
|---|---|---|---|---|
| Global role | `NULL` | `global` | `/roles` | `PUT /users/:userId/roles` |
| Org template | `NULL` | `organization` | `/roles` | any org, `PUT /organizations/:organizationId/members/:userId/roles` |
| Custom org role | the org | `organization` | `/organizations/:organizationId/roles` | that org only |

System roles (`is_system`, seeded from `SYSTEM_ROLE_DEFINITIONS`) are read-only through the
API; the seed keeps their permissions exactly in sync with code:
`platform_admin` (global, all permissions), `property_manager`, `tenant`, `viewer` (templates).

Role keys are unique among platform roles and within each org (partial unique indexes).

### Permissions

| Key                    | Allowed on      | Purpose                              |
|------------------------|-----------------|--------------------------------------|
| `users.read`           | global          | View user accounts                   |
| `users.manage`         | global          | Create/update/deactivate users       |
| `roles.read`           | global, org     | View roles and assignments           |
| `roles.manage`         | global, org     | Create/update/delete/assign roles    |
| `organizations.read`   | global, org     | View organizations                   |
| `organizations.manage` | global, org     | Update organizations and members     |
| `properties.read`      | global, org     | View properties                      |
| `properties.manage`    | global, org     | Create/update/delete properties      |
| `leases.read`          | global, org     | View leases                          |
| `leases.manage`        | global, org     | Create/update/terminate leases       |
| `payments.read`        | global, org     | View payments                        |
| `payments.manage`      | global, org     | Record/update payments               |

### Resolution rules

- **Effective permissions** = permissions of the caller's global roles, plus, on a route
  with `:organizationId`, those of their roles in that org. Global permissions therefore
  apply in every org (that is how a platform admin acts in any org); org permissions never
  leak into another org or onto platform routes.
- Resolved from the DB **per request**, so role edits, revocations and deactivations
  (`is_active = false` → no permissions) take effect immediately. Tokens carry identity only.
- The org comes **only** from the `:organizationId` route param (non-UUID → 400). Every
  org-scoped route must use exactly that param name.
- **Anti-escalation:** a caller can only create, change, delete, assign or unassign a role
  whose permissions they all hold themselves in that context (403 otherwise).
- A role still assigned to anyone cannot be deleted (409).

---

## API Endpoints

### Auth
| Method | Path            | Auth | Description                        |
|--------|-----------------|------|------------------------------------|
| POST   | /auth/register  | None | Create a user (email + password)   |
| POST   | /auth/login     | None | Verify credentials, issue tokens   |
| POST   | /auth/refresh   | None | Rotate session, re-check user is active |
| POST   | /auth/logout    | None | Revoke refresh session             |

### Users
| Method | Path                  | Permission    | Description                                       |
|--------|-----------------------|---------------|---------------------------------------------------|
| GET    | /users/me             | — (JWT)       | Profile + global roles + roles per organization   |
| GET    | /users/me/permissions | — (JWT)       | Effective permissions; `?organizationId=` for one org |
| GET    | /users                | `users.read`  | List all users (stub)                             |

### Roles & permissions
| Method | Path | Permission | Description |
|---|---|---|---|
| GET | /permissions | — (JWT) | Permission catalog with allowed scopes |
| GET | /roles?scope= | `roles.read` | Platform roles (global + org templates) |
| POST | /roles | `roles.manage` | Create platform role `{ key, name, description?, scope, permissions[] }` |
| GET | /roles/:roleId | `roles.read` | One platform role |
| PATCH | /roles/:roleId | `roles.manage` | Update `name`, `description`, `permissions` (replaces set) |
| DELETE | /roles/:roleId | `roles.manage` | 204; 409 if still assigned |
| GET | /users/:userId/roles | `roles.read` | User's global roles |
| PUT | /users/:userId/roles | `roles.manage` | Replace global roles `{ roleIds[] }` |
| GET | /organizations/:organizationId/roles | `roles.read` (in org) | Templates + the org's custom roles |
| POST | /organizations/:organizationId/roles | `roles.manage` (in org) | Create custom role `{ key, name, description?, permissions[] }` |
| GET | /organizations/:organizationId/roles/:roleId | `roles.read` (in org) | Template or own custom role (other orgs' → 404) |
| PATCH | /organizations/:organizationId/roles/:roleId | `roles.manage` (in org) | Custom roles only (templates → 403) |
| DELETE | /organizations/:organizationId/roles/:roleId | `roles.manage` (in org) | Custom roles only; 409 if assigned |
| GET | /organizations/:organizationId/members/:userId/roles | `roles.read` (in org) | Member's roles (404 if not a member) |
| PUT | /organizations/:organizationId/members/:userId/roles | `roles.manage` (in org) | Replace member's roles `{ roleIds[] }` |

---

## Environment Variables

| Variable                        | Default              | Description                    |
|---------------------------------|----------------------|--------------------------------|
| `PORT`                          | `3000`               | HTTP listen port               |
| `NODE_ENV`                      | `development`        | `development` / `production` / `test` |
| `JWT_ACCESS_SECRET`             | **required**         | Access token signing key (≥32 chars in production) |
| `JWT_REFRESH_SECRET`            | **required**         | Refresh token signing key (≥32 chars and ≠ access secret in production) |
| `JWT_ACCESS_EXPIRES_IN_SECONDS` | `900`                | Access token TTL (15 min)      |
| `JWT_REFRESH_EXPIRES_IN_SECONDS`| `604800`             | Refresh token TTL (7 days)     |
| `DB_HOST`                       | `localhost`          | PostgreSQL host                |
| `DB_PORT`                       | `5432`               | PostgreSQL port                |
| `DB_USERNAME`                   | `rental_user`        | PostgreSQL user                |
| `DB_PASSWORD`                   | `rental_pass`        | PostgreSQL password            |
| `DB_NAME`                       | `rental_db`          | PostgreSQL database            |
| `SEED_ADMIN_EMAIL`              | —                    | Optional: seed creates this platform_admin |
| `SEED_ADMIN_PASSWORD`           | —                    | Optional: its password (8–72 chars) |

All variables are validated at startup by `src/config/env.validation.ts`.

---

## Progress Tracker

### ✅ Done

- [x] Project scaffolded with NestJS CLI
- [x] `AuthModule` with JWT access + refresh token issuance
- [x] Token rotation on refresh (single-use sessions)
- [x] Logout (invalidates refresh session)
- [x] Refresh sessions persisted in `refresh_token_sessions` (SHA-256 hash, single-use rotation, revoke on logout)
- [x] Real credential-based login (bcrypt) + `POST /auth/register`
- [x] Env validation at startup (`src/config/env.validation.ts`)
- [x] `InitialSchema` + `DynamicRoles` migrations, both run against Postgres 16; no entity drift
- [x] Seed: permission catalog, system roles synced exactly, optional admin (idempotent)
- [x] `.env.example`, `docker-compose.yml`
- [x] Unit tests for `AuthService`, `JwtAuthGuard`, `PermissionsGuard`; e2e auth + RBAC flows
- [x] `JwtStrategy` (passport-jwt) mapping token payload → `AuthenticatedUser` (identity only)
- [x] Global `JwtAuthGuard` with `@Public()` opt-out, ordered before the RBAC guard
- [x] Permission-only RBAC: global `PermissionsGuard` resolving permissions from the DB per
      request, global + org-scoped (`:organizationId`)
- [x] Dynamic roles: platform roles, org templates, per-org custom roles; system roles read-only
- [x] Role CRUD (`/roles`, `/organizations/:organizationId/roles`), `GET /permissions`
- [x] Role assignment for users (global) and org members, with anti-escalation checks
- [x] `@RequirePermissions()`, `@CurrentUser()` decorators
- [x] `Permissions` catalog (12 keys) with allowed role scopes
- [x] `GET /users/me`, `GET /users/me/permissions`
- [x] `GET /users` admin stub (permission guarded)
- [x] TypeORM entity definitions:
  - [x] `users`
  - [x] `organizations`
  - [x] `organization_memberships`
  - [x] `organization_membership_roles`
  - [x] `roles`
  - [x] `permissions`
  - [x] `role_permissions`
  - [x] `user_global_roles`
  - [x] `refresh_token_sessions`
- [x] Global `ValidationPipe` (`whitelist: true`, `transform: true`)
- [x] Repository pattern: services depend on `I*Repository` interfaces (injected by `*_REPOSITORY` token)
      and plain domain models; all TypeORM code lives in `src/database/typeorm/` (entities, mappers,
      repositories, `TypeOrmDatabaseModule`); an ESLint rule bans TypeORM imports elsewhere in `src/`

---

### 🔴 Missing / Not Yet Implemented

#### Auth
- [ ] Rate limiting / throttling on `POST /auth/register` and `/auth/login`

#### Users Module
- [ ] Wire `UserEntity` via `TypeORM` repository
- [ ] Implement real `listForAdministration()` with DB query
- [ ] `GET /users/:id` — get user by ID
- [ ] `PATCH /users/:id` — update user
- [ ] `DELETE /users/:id` — deactivate/delete user
- [ ] `POST /users` — admin create user

#### Organizations Module
- [ ] Create `OrganizationsModule`, `OrganizationsController`, `OrganizationsService`
- [ ] `POST /organizations` — create organization
- [ ] `GET /organizations` — list organizations
- [ ] `GET /organizations/:organizationId` — get organization
- [ ] `PATCH /organizations/:organizationId` — update organization
- [ ] `DELETE /organizations/:organizationId` — delete organization
- [ ] `POST /organizations/:organizationId/members` — invite/add member
- [ ] `GET /organizations/:organizationId/members` — list members
- [ ] `PATCH /organizations/:organizationId/members/:userId` — update member role
- [ ] `DELETE /organizations/:organizationId/members/:userId` — remove member

#### Properties Module
- [ ] `PropertyEntity` — define DB schema
- [ ] `PropertiesModule`, `PropertiesController`, `PropertiesService`
- [ ] `POST /organizations/:organizationId/properties`
- [ ] `GET /organizations/:organizationId/properties`
- [ ] `GET /organizations/:organizationId/properties/:id`
- [ ] `PATCH /organizations/:organizationId/properties/:id`
- [ ] `DELETE /organizations/:organizationId/properties/:id`

#### Leases Module
- [ ] `LeaseEntity` — define DB schema (tenant, property, start/end date, rent amount)
- [ ] `LeasesModule`, `LeasesController`, `LeasesService`
- [ ] CRUD endpoints under `/organizations/:organizationId/leases`
- [ ] Lease status tracking (active, expired, terminated)

#### Payments Module
- [ ] `PaymentEntity` — define DB schema (lease, amount, due date, paid date, status)
- [ ] `PaymentsModule`, `PaymentsController`, `PaymentsService`
- [ ] CRUD endpoints under `/organizations/:organizationId/payments`
- [ ] Payment status tracking (pending, paid, overdue)

#### RBAC (follow-ups)
- [ ] Per-request permission cache, if the one indexed query per guarded request becomes a hotspot
- [ ] Protect against removing the last holder of `platform_admin`
- [ ] Organization data isolation (Phases 3–6): services must scope every query by
      `:organizationId`; the guard only authorizes, it does not filter data

#### Developer Experience
- [ ] Swagger / OpenAPI setup (`@nestjs/swagger`)

---

## Known Issues / Design Notes

> **Org-scoped permissions** — Token `permissions[]` is built from global roles only. Including org-role permissions in a flat list would leak them across organizations, so Phase 3 has to decide how `@RequirePermissions` works per org.

> **No `SharedModule`** — The `shared/` directory has no `@Module()` class. Guards are registered directly in `AppModule`. A `SharedModule` should be created when the shared layer grows.

> **Persistence boundary** — Services never import `typeorm`, `@nestjs/typeorm` or a `*Entity`. Repository
> methods own their transactions (role + permissions, role assignments), so cross-aggregate atomicity
> (e.g. create organization + owner membership in Phase 3) will need a transaction-runner port.
