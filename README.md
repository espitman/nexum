# Nexum

Database Workspace for Engineers.

Nexum is a modern desktop database workspace for engineering teams. It starts with MongoDB support, but it is designed as a plugin-based app so future database engines can be added without turning the product into a single-database client.

## Vision

```txt
Nexum Desktop
├── MongoDB Plugin
├── PostgreSQL Plugin
├── Redis Plugin
├── Elasticsearch Plugin
├── ClickHouse Plugin
└── More database plugins
```

MongoDB is the first supported data source, not the whole identity of the product.

## Tech Stack

- Electron
- React
- TypeScript
- Vite / electron-vite
- Tailwind CSS
- shadcn/ui
- TanStack Query
- TanStack Router
- TanStack Table
- TanStack Virtual
- Monaco Editor
- Lucide Icons
- Zod
- official MongoDB Node.js driver
- BSON EJSON
- electron-store
- keytar

Nexum does not use Mongoose for target databases. It connects to arbitrary databases with unknown schemas, so the app should preserve raw driver behavior and generate raw MongoDB commands.

## Architecture Principles

- Plugin-based from day one
- Renderer never connects directly to databases
- Secure typed preload API between renderer and main process
- IPC inputs validated with Zod
- Secrets stored in macOS Keychain with `keytar`
- Non-secret metadata stored locally with `electron-store`
- BSON-safe serialization over IPC using EJSON
- Sanitized errors with no leaked stack traces or connection URIs
- Read-only mode and production safeguards for risky operations

## Planned Monorepo Structure

```txt
nexum/
  apps/
    desktop/
      src/
        main/
        preload/
        renderer/
          app/
          routes/
          features/
          components/
          styles/

  packages/
    core/
    ui/
    mongodb-plugin/
    shared/

  docs/
```

## Documentation

Read the full architecture document:

[Nexum Architecture](docs/nexum-architecture.md)

## License

License is not set yet.
