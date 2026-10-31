# Server Domain Modularization Plan

## Goal

Gradually move the backend toward feature-first domain modules while preserving existing API behavior. Each module should own its domain-specific routes, controllers, validation, and services. Shared middleware and infrastructure remain shared.

This document is the plan only. Implementation proceeds one step at a time, with focused verification before moving to the next step.

## Current Structure

- Most routes, controllers, validators, and models are stored in layer-oriented top-level folders.
- Some service code is already grouped by domain, including `services/curriculum/` and `services/messaging/`.
- `server.js` imports and mounts many routes directly, while `routes/index.js` exports only a subset.
- `server.js` also configures the app and starts background jobs.
- Curriculum has focused contract tests and maintainability scripts, making it a practical pilot.

## Target Shape

Start with a domain-owned module, for example:

```text
modules/
  curriculum/
    index.js
    routes.js
    controller.js
    validators.js
    services/
    repository.js
    tests/
```

Shared middleware, configuration, database setup, logging, and cross-domain utilities stay outside `modules/`. Existing shared models remain in `models/` initially; move a model only after confirming its ownership and checking all imports.

## Execution Steps

### Step 1: Establish the curriculum baseline

- Inventory every import and runtime entry point for curriculum routes, controllers, validators, services, repositories, models, jobs, and tests.
- Confirm the current mount path and middleware order for curriculum endpoints.
- Run the existing focused curriculum tests and quality checks before moving files.
- Record any pre-existing failures so they are not confused with migration regressions.

**Gate:** The dependency map and baseline results are recorded; no implementation files have moved.

### Step 2: Define the module interface

- Decide the smallest public surface the app needs, preferably one exported router from the curriculum module.
- Keep internal services and repository details private to the module where practical.
- Keep existing URL paths, permissions, validation behavior, and response contracts unchanged.

**Gate:** The proposed module entry point can replace the existing route import without changing endpoint behavior.

### Step 3: Move curriculum code incrementally

- Move one category at a time: validators, controller, routes, then domain services/repository.
- Update imports in the same step as each move; avoid compatibility re-export files unless an external consumer requires them.
- Keep shared middleware and models in their existing locations during the pilot.
- Update tests and focused scripts only where paths require it.

**Gate after each move:** Focused curriculum tests and relevant lint checks pass before the next category is moved.

### Step 4: Integrate and verify the pilot

- Mount the module router from the existing app composition point without changing the route prefix or middleware order.
- Search for stale imports and duplicate route registrations.
- Run the focused curriculum test and quality checks, then perform an API/startup smoke check if the local environment supports it.

**Gate:** Curriculum behavior and route contracts are unchanged, and the domain code is discoverable under one module.

### Step 5: Review the pilot before expanding

- Note what improved and any coupling that prevented a clean boundary.
- Adjust the module convention based on evidence, not folder symmetry alone.
- Select the next domain only after the pilot is stable; messaging is a candidate because it already has a grouped service layer and focused tests.

### Step 6: Address app composition separately

- After a successful pilot, consider making route registration consistent across the server.
- Separately evaluate extracting Express app configuration and background-job lifecycle from `server.js`.
- Preserve startup order, scheduler enablement flags, route order, and graceful shutdown behavior.

These are separate changes from domain-file moves and should each have their own focused verification.

## Guardrails

- Do not move the whole backend in one pass.
- Do not change API paths, auth/tenant middleware, permissions, request validation, or response shapes as part of file moves.
- Do not relocate shared models or utilities without checking all consumers.
- Keep each implementation step reviewable and reversible.
- Do not run build commands as part of this plan unless explicitly requested.

## Definition of Done

- The pilot domain has a clear module entry point and cohesive ownership of its domain-specific code.
- Existing routes and contracts remain unchanged.
- Focused tests and lint/quality checks pass, with any unrelated baseline failures documented.
- The next domain or broader server restructuring is not started until the pilot is reviewed.