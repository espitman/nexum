# Nexum TODO

This file tracks project phases, tasks, and subtasks. When a task is completed, mark it with `[x]`.

## Phase 0 — Project Foundation

- [x] Create initial architecture document
  - [x] Define product vision
  - [x] Define plugin-based architecture
  - [x] Define MongoDB phase scope
  - [x] Define recommended tech stack
  - [x] Add TanStack usage to architecture
- [x] Create GitHub repository
  - [x] Initialize local Git repository
  - [x] Create GitHub repository
  - [x] Make repository public
- [x] Create project README
  - [x] Add product summary
  - [x] Add architecture principles
  - [x] Add planned tech stack
  - [x] Link architecture documentation
- [x] Create agent rules
  - [x] Require explicit user request before Git write operations
  - [x] Require `pnpm` as package manager
- [x] Choose project license
  - [x] Pick license type
  - [x] Add `LICENSE`
  - [x] Update README license section

## Phase 1 — Monorepo Bootstrap

- [x] Create pnpm workspace
  - [x] Add root `package.json`
  - [x] Add `pnpm-workspace.yaml`
  - [x] Add `turbo.json`
  - [x] Add root `.gitignore`
  - [x] Add root TypeScript config
- [x] Create desktop app package
  - [x] Add `apps/desktop/package.json`
  - [x] Add `electron.vite.config.ts`
  - [x] Add Electron main entry
  - [x] Add Electron preload entry
  - [x] Add React renderer entry
  - [x] Add Vite HTML entry
- [x] Create shared packages
  - [x] Add `packages/core`
  - [x] Add `packages/ui`
  - [x] Add `packages/mongodb-plugin`
  - [x] Add `packages/shared`
- [x] Add baseline tooling
  - [x] Add TypeScript scripts
  - [x] Add lint script
  - [x] Add format script
  - [x] Add typecheck script
  - [x] Add development script
- [x] Verify bootstrap
  - [x] Install dependencies with `pnpm`
  - [x] Run typecheck
  - [x] Start desktop app locally
  - [x] Confirm renderer can call main through typed preload API

## Phase 1.5 — Visual Prototype

- [x] Match desktop app to concept design
  - [x] Add mock connection data
  - [x] Add mock database tree
  - [x] Add mock document table
  - [x] Add mock document inspector
  - [x] Align shell spacing, colors, and layout with `docs/design`

## Phase 2 — App Shell

- [x] Build desktop shell layout
  - [x] Add top bar
  - [x] Add left sidebar
  - [x] Add main workspace region
  - [x] Add empty state
- [x] Add app providers
  - [x] Add TanStack Query client
  - [x] Add TanStack Router
  - [x] Add theme provider
- [x] Add core UI states
  - [x] Add connection status indicator
  - [x] Add environment badge
  - [x] Add read-only badge
  - [x] Add error toast surface
- [x] Verify shell
  - [x] App opens on macOS
  - [x] Shell visually displays as Nexum
  - [x] Routes work inside renderer

## Phase 3 — Core Architecture

- [x] Define shared result and error primitives
  - [x] Add `Result` helpers
  - [x] Add `AppError` model
  - [x] Add error sanitizer
- [x] Define plugin contracts
  - [x] Add `NexumPlugin` type
  - [x] Add `PluginCapabilities` type
  - [x] Add explorer node model
  - [x] Add connection profile model
- [x] Implement registries and stores
  - [x] Add plugin registry
  - [x] Add connection registry
  - [x] Add connection metadata store
  - [x] Add secret store wrapper
  - [x] Add audit log service
- [x] Verify core architecture
  - [x] Add basic unit tests for core utilities
  - [x] Run typecheck

## Phase 4 — Secure IPC and Preload API

- [x] Configure secure Electron window
  - [x] Disable `nodeIntegration`
  - [x] Enable `contextIsolation`
  - [x] Enable sandbox
  - [x] Use preload script
- [x] Create typed preload API
  - [x] Add health check API
  - [x] Add connection API contract
  - [x] Add explorer API contract
  - [x] Add MongoDB API contract
  - [x] Add audit API contract
- [x] Create IPC router
  - [x] Add typed IPC wrapper
  - [x] Validate inputs with Zod
  - [x] Sanitize errors before returning to renderer
- [x] Verify IPC
  - [x] Renderer can call health check
  - [x] Invalid input is rejected safely
  - [x] Renderer has no direct database or Node access

## Phase 5 — MongoDB Connection Manager

- [x] Add MongoDB connection schema
  - [x] Validate name
  - [x] Validate URI
  - [x] Validate environment
  - [x] Validate read-only mode
- [x] Implement connection storage
  - [x] Store metadata in `electron-store`
  - [x] Store URI in Keychain with `keytar`
  - [x] Prevent secret leakage in logs and errors
- [x] Implement connection lifecycle
  - [x] Create profile
  - [x] Update profile
  - [x] Delete profile
  - [x] Test connection with `ping`
  - [x] Connect profile
  - [x] Disconnect profile
- [x] Build connection UI
  - [x] Add connection list
  - [x] Add connection form
  - [x] Add environment selector
  - [x] Add read-only toggle
  - [x] Add test connection action
- [x] Verify connection manager
  - [x] Add repeatable verification command
  - [x] Test remote MongoDB server connection
  - [x] Local MongoDB install is not required for this phase
  - [x] Confirm URI is not stored in plain JSON

## Phase 6 — MongoDB Explorer

- [x] Implement explorer backend
  - [x] List databases
  - [x] List collections
  - [x] Distinguish collections and views
  - [x] Return typed explorer nodes
- [x] Build explorer UI
  - [x] Render connection root nodes
  - [x] Render database nodes
  - [x] Render collection nodes
  - [x] Add loading state
  - [x] Add empty state
  - [x] Add error state
- [x] Verify explorer
  - [x] Browse databases
  - [x] Browse collections
  - [x] Select collection into workspace

## Phase 7 — Document Viewer

- [x] Implement find API
  - [x] Default filter to `{}`
  - [x] Default limit to `50`
  - [x] Support skip
  - [x] Support sort
  - [x] Support projection
  - [x] Add 30 second max query time
  - [x] Serialize documents with EJSON
- [x] Build document views
  - [x] Add documents tab
  - [x] Add raw filter preview
  - [x] Add run action
  - [x] Add limit control
  - [x] Add skip control
  - [x] Add TanStack Table view
  - [x] Add JSON view
  - [x] Add TanStack Virtual for large result sets
- [x] Verify document viewer
  - [x] View first 50 documents
  - [x] Switch table and JSON modes
  - [x] Show execution time
  - [x] Preserve BSON types through EJSON

## Phase 8 — Visual Query Builder

- [x] Implement query builder model
  - [x] Add condition model
  - [x] Add group model
  - [x] Support AND/OR combinators
- [x] Implement supported operators
  - [x] Equals
  - [x] Not equals
  - [x] Greater than
  - [x] Greater than or equal
  - [x] Less than
  - [x] Less than or equal
  - [x] Contains
  - [x] Exists
  - [x] In
  - [x] Not in
  - [x] Regex
- [x] Implement field inference
  - [x] Sample up to 100 documents by default
  - [x] Infer nested paths with dot notation
  - [x] Return detected types
  - [x] Return occurrence counts
- [x] Build query builder UI
  - [x] Add condition rows
  - [x] Add group rows
  - [x] Add field input
  - [x] Add operator select
  - [x] Add value input
  - [x] Add raw JSON preview
  - [x] Add run query action
- [ ] Verify query builder
  - [ ] Generate valid MongoDB filters
  - [ ] Run generated query
  - [ ] Show result preview

## Phase 9 — Safe Document Editor

- [ ] Implement update API
  - [ ] Parse original document with EJSON
  - [ ] Parse edited document with EJSON
  - [ ] Block `_id` changes
  - [ ] Save with `replaceOne`
  - [ ] Return matched and modified counts
- [ ] Add safety protections
  - [ ] Block writes on read-only connections
  - [ ] Require confirmation for production writes
  - [ ] Audit write attempts
- [ ] Build editor UI
  - [ ] Open single-document editor
  - [ ] Edit EJSON in Monaco
  - [ ] Show validation errors
  - [ ] Add save confirmation
- [ ] Verify editor
  - [ ] Save one document safely
  - [ ] Confirm `_id` changes are rejected
  - [ ] Confirm read-only mode blocks writes

## Phase 10 — Aggregation Builder

- [ ] Implement pipeline model
  - [ ] Add stage model
  - [ ] Support enable/disable
  - [ ] Support reordering
  - [ ] Generate raw pipeline
- [ ] Support MVP stages
  - [ ] `$match`
  - [ ] `$project`
  - [ ] `$sort`
  - [ ] `$limit`
  - [ ] `$skip`
  - [ ] `$count`
  - [ ] `$group`
  - [ ] `$unwind`
- [ ] Block dangerous stages
  - [ ] `$out`
  - [ ] `$merge`
  - [ ] `$function`
  - [ ] `$accumulator`
- [ ] Build aggregation UI
  - [ ] Add stage list
  - [ ] Add stage editor
  - [ ] Add raw pipeline preview
  - [ ] Add run action
  - [ ] Add result preview
- [ ] Verify aggregation builder
  - [ ] Run allowed pipeline
  - [ ] Reject blocked stages
  - [ ] Show execution time

## Phase 11 — Audit, Safety, and Polish

- [ ] Implement local audit log
  - [ ] Log connection events
  - [ ] Log query events
  - [ ] Log aggregation events
  - [ ] Log document update events
  - [ ] Exclude secrets
- [ ] Add production safety UX
  - [ ] Show production badge
  - [ ] Default production connections to read-only
  - [ ] Require explicit write confirmation
- [ ] Polish errors and empty states
  - [ ] Add user-readable messages
  - [ ] Hide unsafe details
  - [ ] Add retry actions where useful
- [ ] Final MVP verification
  - [ ] Run lint
  - [ ] Run typecheck
  - [ ] Run tests
  - [ ] Run desktop app
  - [ ] Verify primary MongoDB workflow end to end
