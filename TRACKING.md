# Rental Management System — Project Tracking

> Last updated: 2026-09-05

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
  ├─► JwtAuthGuard          (route-level, via @UseGuards)
  │     Validates Bearer token, populates request.user
  │
  ├─► RolesGuard            (global APP_GUARD)
  │     Reads @RequireRoles() metadata
  │     Checks globalRoles / organizationRoles from JWT
  │
  ├─► PermissionsGuard      (global APP_GUARD)
  │     Reads @RequirePermissions() metadata
  │     Checks permissions[] from JWT
  │
  └─► Controller → Service → (Repository → PostgreSQL)
                                └── not yet wired
```

### Module Layout

```
src/
├── main.ts                        Bootstrap, global ValidationPipe (whitelist, transform)
├── app.module.ts                  Root module — imports AuthModule, UsersModule
│
├── auth/                          Authentication feature module
│   ├── auth.controller.ts         POST /auth/login, /auth/refresh, /auth/logout
│   ├── auth.service.ts            Token issuance, rotation, session tracking (in-memory)
│   ├── auth.module.ts             JwtModule (async config), PassportModule
│   ├── dto/
│   │   ├── login.dto.ts           userId, email, globalRoles, organizationRoles, permissions
│   │   └── refresh-token.dto.ts   refreshToken string
│   ├── entities/
│   │   └── refresh-token-session.entity.ts   DB schema (defined, NOT wired)
│   ├── guards/
│   │   └── jwt-auth.guard.ts      Extends AuthGuard('jwt')
│   ├── interfaces/
│   │   └── token-payload.interface.ts        AccessTokenPayload, RefreshTokenPayload
│   ├── strategies/
│   │   └── jwt.strategy.ts        Reads Bearer token, maps payload → AuthenticatedUser
│   └── types/
│       └── auth-token-response.type.ts
│
└── modules/
    ├── shared/                    Cross-cutting concerns (no NestJS module yet)
    │   ├── constants/
    │   │   └── permissions.ts     String constants: users.read, properties.manage, etc.
    │   ├── decorators/
    │   │   ├── current-user.decorator.ts         @CurrentUser() param decorator
    │   │   ├── require-roles.decorator.ts         @RequireRoles({global, organization})
    │   │   └── require-permissions.decorator.ts   @RequirePermissions(...perms)
    │   ├── entities/
    │   │   ├── role.entity.ts             roles table (key, name, scope: global|organization)
    │   │   ├── permission.entity.ts       permissions table (key, description)
    │   │   └── role-permission.entity.ts  role_permissions join table
    │   ├── enums/
    │   │   ├── global-role.enum.ts        GlobalRole.PLATFORM_ADMIN
    │   │   └── organization-role.enum.ts  PROPERTY_MANAGER | TENANT | VIEWER
    │   ├── guards/
    │   │   ├── roles.guard.ts             Global guard — checks roles from JWT
    │   │   └── permissions.guard.ts       Global guard — checks permissions from JWT
    │   └── interfaces/
    │       └── authenticated-user.interface.ts    Shape of request.user
    │
    ├── users/
    │   ├── users.controller.ts    GET /users/me, GET /users (admin stub)
    │   ├── users.service.ts       getCurrentUser(), listForAdministration() (stub)
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
│ refresh_token_sessions │  (defined, not yet wired to auth service)
│────────────────────────│
│ id (PK)                │
│ user_id                │
│ session_id (UK)        │
│ token_hash             │
│ expires_at             │
│ revoked_at (nullable)  │
└────────────────────────┘
```

---

## Authorization Model

### Roles (two scopes)

| Scope        | Enum Value         | Role Key           |
|--------------|--------------------|--------------------|
| Global       | `GlobalRole`       | `platform_admin`   |
| Organization | `OrganizationRole` | `property_manager` |
| Organization | `OrganizationRole` | `tenant`           |
| Organization | `OrganizationRole` | `viewer`           |

Organization role context is resolved from the `X-Organization-Id` request header,
or falls back to an `organizationId` route parameter.

### Permissions

| Key                    | Intended Purpose             |
|------------------------|------------------------------|
| `users.read`           | View user list               |
| `users.manage`         | Create/update/delete users   |
| `organizations.read`   | View organizations           |
| `organizations.manage` | Create/update/delete orgs    |
| `properties.read`      | View properties              |
| `properties.manage`    | Create/update/delete properties |
| `leases.read`          | View leases                  |
| `leases.manage`        | Create/update/delete leases  |
| `payments.read`        | View payments                |
| `payments.manage`      | Create/update/delete payments|

### Guard Chain (applied globally)
```
RolesGuard → PermissionsGuard
```
Both read from JWT claims embedded at login time.

---

## API Endpoints

### Auth
| Method | Path            | Auth | Description                        |
|--------|-----------------|------|------------------------------------|
| POST   | /auth/login     | None | Issue access + refresh token pair  |
| POST   | /auth/refresh   | None | Rotate tokens via refresh token    |
| POST   | /auth/logout    | None | Invalidate refresh session         |

### Users
| Method | Path       | Guards                                  | Description                     |
|--------|------------|-----------------------------------------|---------------------------------|
| GET    | /users/me  | JWT                                     | Current user profile (from JWT) |
| GET    | /users     | JWT + `platform_admin` + `users.read`   | List all users (stub)           |

---

## Environment Variables

| Variable                        | Default              | Description                    |
|---------------------------------|----------------------|--------------------------------|
| `PORT`                          | `3000`               | HTTP listen port               |
| `JWT_ACCESS_SECRET`             | `dev_access_secret`  | Access token signing key       |
| `JWT_REFRESH_SECRET`            | `dev_refresh_secret` | Refresh token signing key      |
| `JWT_ACCESS_EXPIRES_IN_SECONDS` | `900`                | Access token TTL (15 min)      |
| `JWT_REFRESH_EXPIRES_IN_SECONDS`| `604800`             | Refresh token TTL (7 days)     |
| `DB_HOST`                       | —                    | ⚠️ Not defined yet             |
| `DB_PORT`                       | —                    | ⚠️ Not defined yet             |
| `DB_USERNAME`                   | —                    | ⚠️ Not defined yet             |
| `DB_PASSWORD`                   | —                    | ⚠️ Not defined yet             |
| `DB_NAME`                       | —                    | ⚠️ Not defined yet             |

---

## Progress Tracker

### ✅ Done

- [x] Project scaffolded with NestJS CLI
- [x] `AuthModule` with JWT access + refresh token issuance
- [x] Token rotation on refresh (single-use sessions)
- [x] Logout (invalidates refresh session)
- [x] In-memory refresh session tracking (Map)
- [x] `JwtStrategy` (passport-jwt) mapping token payload → `AuthenticatedUser`
- [x] Global `RolesGuard` (checks global + organization-scoped roles from JWT)
- [x] Global `PermissionsGuard` (checks fine-grained permissions from JWT)
- [x] `@RequireRoles()`, `@RequirePermissions()`, `@CurrentUser()` decorators
- [x] `GlobalRole` and `OrganizationRole` enums
- [x] `Permissions` string constants (all 10 permission keys)
- [x] `GET /users/me` endpoint
- [x] `GET /users` admin stub (JWT + role + permission guarded)
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

---

### 🔴 Missing / Not Yet Implemented

#### Infrastructure
- [ ] `TypeOrmModule.forRoot()` — **no database connection at all**
- [ ] DB environment variables (host, port, user, password, dbname)
- [ ] TypeORM migrations setup (`DataSource` config file)
- [ ] Initial seed data (roles, permissions, role-permission mappings)

#### Auth
- [ ] Real credential-based login (password hash check against `users` table)
- [ ] Persist refresh sessions to `refresh_token_sessions` table
  - [ ] Wire `RefreshTokenSessionEntity` to `AuthService`
  - [ ] Hash refresh token before storing (`bcrypt` is already a dependency)
  - [ ] Check `revokedAt` and `expiresAt` on refresh
- [ ] Token revocation on logout (set `revokedAt` in DB)
- [ ] User registration endpoint (`POST /auth/register`)

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
- [ ] `GET /organizations/:id` — get organization
- [ ] `PATCH /organizations/:id` — update organization
- [ ] `DELETE /organizations/:id` — delete organization
- [ ] `POST /organizations/:id/members` — invite/add member
- [ ] `GET /organizations/:id/members` — list members
- [ ] `PATCH /organizations/:id/members/:userId` — update member role
- [ ] `DELETE /organizations/:id/members/:userId` — remove member

#### Properties Module
- [ ] `PropertyEntity` — define DB schema
- [ ] `PropertiesModule`, `PropertiesController`, `PropertiesService`
- [ ] `POST /organizations/:orgId/properties`
- [ ] `GET /organizations/:orgId/properties`
- [ ] `GET /organizations/:orgId/properties/:id`
- [ ] `PATCH /organizations/:orgId/properties/:id`
- [ ] `DELETE /organizations/:orgId/properties/:id`

#### Leases Module
- [ ] `LeaseEntity` — define DB schema (tenant, property, start/end date, rent amount)
- [ ] `LeasesModule`, `LeasesController`, `LeasesService`
- [ ] CRUD endpoints under `/organizations/:orgId/leases`
- [ ] Lease status tracking (active, expired, terminated)

#### Payments Module
- [ ] `PaymentEntity` — define DB schema (lease, amount, due date, paid date, status)
- [ ] `PaymentsModule`, `PaymentsController`, `PaymentsService`
- [ ] CRUD endpoints under `/organizations/:orgId/payments`
- [ ] Payment status tracking (pending, paid, overdue)

#### RBAC (DB-backed)
- [ ] Load roles and permissions from DB at login (instead of trusting caller input)
- [ ] Admin endpoints to manage roles (`GET/POST/DELETE /roles`)
- [ ] Admin endpoints to manage permissions (`GET /permissions`)
- [ ] Admin endpoints to assign roles to users globally
- [ ] Admin endpoints to assign roles to organization members

#### Developer Experience
- [ ] Swagger / OpenAPI setup (`@nestjs/swagger`)
- [ ] `.env.example` file
- [ ] Docker / `docker-compose.yml` for local PostgreSQL
- [ ] Unit tests for `AuthService`, `RolesGuard`, `PermissionsGuard`
- [ ] E2E tests for auth flow

---

## Known Issues / Design Notes

> **Login trusts the caller** — `POST /auth/login` currently accepts roles and permissions directly in the request body and embeds them into the JWT without any DB validation. This is intentional scaffolding but **must be replaced** before any real usage.

> **In-memory sessions** — Refresh sessions are stored in a `Map` inside `AuthService`. They are lost on server restart and do not scale horizontally. The `refresh_token_sessions` entity is ready to be wired in.

> **No `SharedModule`** — The `shared/` directory has no `@Module()` class. Guards are registered directly in `AppModule`. A `SharedModule` should be created when the shared layer grows.
