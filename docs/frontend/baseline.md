# Frontend baseline

Date: 2026-09-15
Source branch: `develop`
Source revision before implementation: `d74692f`

## Environment

- Local workstation: source editing only; no project dependency installation.
- Application test host: GPUHome Ubuntu 22.04 container instance. Node.js 20 and the backend toolchain are installed; frontend and backend listen only on `127.0.0.1`.
- Database host: external Ubuntu Docker host running PostgreSQL 16.13 with a persistent volume. The application uses a dedicated least-privilege `roc_app` login.
- Public application ports are not required; browser verification uses an SSH tunnel.

## Existing product surface

The existing frontend provides login, registration, profile/password management, project CRUD, map upload/delete, a map viewer, vehicle registration/status display, protocol documentation, and super administrator user management. It uses page-local navigation and page-local data loading.

Known baseline limitations are tracked as R01-R14 in `/plan.md`. The highest-risk findings are cross-resource authorization gaps, project-unscoped vehicle queries, a non-persistent default-map UI, stringly typed database JSON, and map layers that do not share one viewport transform.

## Fixture required before visual acceptance

The test database must provide:

- one regular user and one super administrator;
- a second regular user for authorization checks;
- two projects owned by different users;
- one square and one rectangular map image;
- online, offline, error, unassigned, and missing-position vehicles;
- a deterministic road network and known map control points.

Test credentials and real tokens must remain outside the repository. Screenshots must use synthetic names and positions.

## Baseline verification status

- Static code review: complete.
- Local dependency install/build: intentionally skipped; local workstation is source-edit only.
- Test-host typecheck, lint, 15 unit tests, production build, and backend compilation: passed.
- Browser verification: public home, protocol, login, and registration pages checked at desktop and 390 px widths; the protocol page overflow found during testing was fixed.
- Backend/database smoke test: passed for registration, project create/read, map upload/default selection, vehicle create/update/project filtering, and cleanup.
- Full authenticated visual matrix and two-user authorization matrix: still pending representative fixture data.
