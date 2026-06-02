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

- [ ] Configure secure Electron window
  - [ ] Disable `nodeIntegration`
  - [ ] Enable `contextIsolation`
  - [ ] Enable sandbox
  - [ ] Use preload script
- [ ] Create typed preload API
  - [ ] Add health check API
  - [ ] Add connection API contract
  - [ ] Add explorer API contract
  - [ ] Add MongoDB API contract
  - [ ] Add audit API contract
- [ ] Create IPC router
  - [ ] Add typed IPC wrapper
  - [ ] Validate inputs with Zod
  - [ ] Sanitize errors before returning to renderer
- [ ] Verify IPC
  - [ ] Renderer can call health check
  - [ ] Invalid input is rejected safely
  - [ ] Renderer has no direct database or Node access

## Phase 5 — MongoDB Connection Manager

- [ ] Add MongoDB connection schema
  - [ ] Validate name
  - [ ] Validate URI
  - [ ] Validate environment
  - [ ] Validate read-only mode
- [ ] Implement connection storage
  - [ ] Store metadata in `electron-store`
  - [ ] Store URI in Keychain with `keytar`
  - [ ] Prevent secret leakage in logs and errors
- [ ] Implement connection lifecycle
  - [ ] Create profile
  - [ ] Update profile
  - [ ] Delete profile
  - [ ] Test connection with `ping`
  - [ ] Connect profile
  - [ ] Disconnect profile
- [ ] Build connection UI
  - [ ] Add connection list
  - [ ] Add connection form
  - [ ] Add environment selector
  - [ ] Add read-only toggle
  - [ ] Add test connection action
- [ ] Verify connection manager
  - [ ] Test local MongoDB connection
  - [ ] Test MongoDB Atlas connection
  - [ ] Confirm URI is not stored in plain JSON

## Phase 6 — MongoDB Explorer

- [ ] Implement explorer backend
  - [ ] List databases
  - [ ] List collections
  - [ ] Distinguish collections and views
  - [ ] Return typed explorer nodes
- [ ] Build explorer UI
  - [ ] Render connection root nodes
  - [ ] Render database nodes
  - [ ] Render collection nodes
  - [ ] Add loading state
  - [ ] Add empty state
  - [ ] Add error state
- [ ] Verify explorer
  - [ ] Browse databases
  - [ ] Browse collections
  - [ ] Select collection into workspace

## Phase 7 — Document Viewer

- [ ] Implement find API
  - [ ] Default filter to `{}`
  - [ ] Default limit to `50`
  - [ ] Support skip
  - [ ] Support sort
  - [ ] Support projection
  - [ ] Add 30 second max query time
  - [ ] Serialize documents with EJSON
- [ ] Build document views
  - [ ] Add documents tab
  - [ ] Add raw filter preview
  - [ ] Add run action
  - [ ] Add limit control
  - [ ] Add skip control
  - [ ] Add TanStack Table view
  - [ ] Add JSON view
  - [ ] Add TanStack Virtual for large result sets
- [ ] Verify document viewer
  - [ ] View first 50 documents
  - [ ] Switch table and JSON modes
  - [ ] Show execution time
  - [ ] Preserve BSON types through EJSON

## Phase 8 — Safe Document Editor

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

## Phase 9 — Visual Query Builder

- [ ] Implement query builder model
  - [ ] Add condition model
  - [ ] Add group model
  - [ ] Support AND/OR combinators
- [ ] Implement supported operators
  - [ ] Equals
  - [ ] Not equals
  - [ ] Greater than
  - [ ] Greater than or equal
  - [ ] Less than
  - [ ] Less than or equal
  - [ ] Contains
  - [ ] Exists
  - [ ] In
  - [ ] Not in
  - [ ] Regex
- [ ] Implement field inference
  - [ ] Sample up to 100 documents by default
  - [ ] Infer nested paths with dot notation
  - [ ] Return detected types
  - [ ] Return occurrence counts
- [ ] Build query builder UI
  - [ ] Add condition rows
  - [ ] Add group rows
  - [ ] Add field input
  - [ ] Add operator select
  - [ ] Add value input
  - [ ] Add raw JSON preview
  - [ ] Add run query action
- [ ] Verify query builder
  - [ ] Generate valid MongoDB filters
  - [ ] Run generated query
  - [ ] Show result preview

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
