# ROC-SYSTEM implementation verification

Date: 2026-09-15
Branch: `develop`

## Verified environment

- Application host: Ubuntu 22.04 GPU container instance.
- Frontend: Vite preview on `127.0.0.1:13000`.
- Backend: Drogon 1.9.9 on `127.0.0.1:18080`.
- Database: PostgreSQL 16.13 on an external Docker host, persistent volume retained.
- Database application identity: `roc_app`, limited to connect/schema usage and business-table CRUD/sequence usage.
- Browser access: local SSH tunnel; no application port opened publicly.

## Automated checks

| Check | Result |
| --- | --- |
| Frontend TypeScript | Passed |
| ESLint | Passed |
| Vitest | 5 files, 18 tests passed |
| Vite production build | Passed; 1698 modules transformed |
| Backend CMake build | Passed |
| `GET /api/health` | 200, `ok=true` |
| `GET /api/db/ping` | 200, `ok=true` |

The reproducible database/API smoke test is `scripts/test/api-smoke.sh`. It creates isolated temporary data for two users and removes it on exit. The latest run passed:

1. register two temporary users;
2. create and read a project, including an apostrophe in its name;
3. create a second project for cross-project checks;
4. upload a PNG map and set it as default;
5. return map bytes to the owner, reject anonymous access with HTTP 401, and return HTTP 404 from the legacy `/static` path;
6. create a vehicle bound to the same project and map;
7. update typed telemetry and verify version increment;
8. issue a per-vehicle device credential once, hide its plaintext on later reads, reject cross-user credential access, reject a mismatched vehicle UUID, and reject it after revocation;
9. prove unauthenticated clients receive no vehicle event and are closed after the authentication timeout, authenticate by first message, reject a cross-user project subscription, receive a project-scoped live event, and verify its persisted versioned telemetry;
10. list vehicles through `project_id` filtering;
11. reject deletion of a map while a vehicle is bound to it with HTTP 409;
12. reject binding a map to a vehicle in another project with HTTP 409;
13. reject the second user's project, map, image, default-map, vehicle-list, vehicle-update, vehicle-delete, and platform-admin requests with HTTP 403;
14. delete vehicles, maps, projects, and both temporary users.

Malformed project, map-parent, vehicle-filter, and vehicle path identifiers are also covered and return HTTP 400 instead of leaking PostgreSQL cast failures as HTTP 500.

After cleanup, database counts returned to the pre-test values: 2 users, 1 project, 0 maps, 0 vehicles.

## Database migration and recovery

- Migrations `001_vehicle_map_assignment` through `005_vehicle_device_credentials` are applied and recorded in `schema_migrations`.
- A focused pre-005 custom-format backup of `vehicles` and `schema_migrations` is retained on the database host.
- A custom-format `pg_dump` was created and validated before migration.
- The PostgreSQL container and `roc_pgdata` volume were retained; only obsolete ROC frontend/backend containers on the database host were removed.

## Visual checks

- Public home page: light-theme redesign passed at desktop and 390 px viewport; hero, navigation, CTAs, operational visual, and capability section were checked.
- Protocol page: desktop passed; the initial narrow-screen two-column overflow was reproduced, fixed, and retested with `scrollWidth == clientWidth`.
- Login and registration: shared light-theme split layout passed at desktop and 390 px viewport; responsive collapse, form focus states, and localized authentication errors were checked. Unsupported remember-password, password-recovery, placeholder policy links, and client-only puzzle security theatre remain removed.
- Protocol tabs were both checked after the responsive fix.
- Authenticated fixture flow: project workspace and map resources passed at 390 px; the protected map thumbnail rendered through the Bearer-token Blob request.
- Map monitor: 390 px map/vehicle selector/detail drawer and 1440×900 list/map/inspector layout passed with a bound online vehicle.
- Browser console contained no errors during the authenticated project → map → monitor flow. The temporary fixture was removed after verification.
- Authenticated administrator shell, platform-account scope/role badges, project owner labels, live connection state, vehicle credential dialog, and temporary-fixture cleanup were checked after T04/T09 deployment.

## Known remaining release blockers

- Production TLS and a non-empty `WS_ALLOWED_ORIGINS` allowlist remain required; the test tunnel intentionally uses loopback HTTP/WS.
- A 30-minute reconnect/heartbeat stability run and permission-revocation-under-load exercise remain required before production release.
- The external PostgreSQL port must be restricted by cloud firewall/security group to the application host or a private network before production use.
- Additional authenticated error/empty-state visual fixtures and keyboard-only interaction coverage remain pending.
- GPUHome container instances cannot run nested Docker; frontend/backend continue as native test processes.

## Test administrator

- The existing `admin` account is retained as the user's test administrator and its historical default password has been rotated.
- The replacement password was verified without recording it in the repository or this document; the previous password now returns HTTP 401.
- Fresh database initialization no longer seeds any fixed administrator credential.
