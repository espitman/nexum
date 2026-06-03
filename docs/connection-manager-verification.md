# Connection Manager Verification

Use the desktop verification script to check MongoDB connectivity and secret storage behavior.

```sh
corepack pnpm --filter @nexum/desktop verify:connections
```

Optional environment variables:

```sh
NEXUM_VERIFY_LOCAL_MONGODB_URI="mongodb://localhost:27017/admin"
NEXUM_VERIFY_ATLAS_MONGODB_URI="mongodb+srv://user:password@cluster.example.mongodb.net/admin"
NEXUM_VERIFY_REQUIRE_LOCAL=1
NEXUM_VERIFY_REQUIRE_ATLAS=1
NEXUM_CONNECTIONS_JSON="/path/to/connections.json"
```

The script verifies:

- local MongoDB ping when a local URI is available
- MongoDB Atlas ping when an Atlas URI is provided
- Keychain URI write/read/delete through `keytar`
- no MongoDB URI or `uri` key is present in the `electron-store` metadata JSON

Phase 5 verification does not require a local MongoDB install. The connection
manager can be accepted with a real reachable MongoDB server, including a
replica set URI, plus the Keychain and plain JSON storage checks above.
