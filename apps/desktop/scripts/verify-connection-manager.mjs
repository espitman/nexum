import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import keytar from "keytar";
import { MongoClient } from "mongodb";

const keychainService = "com.nexum.connection-uri";
const probeAccount = "nexum_verify_connection_manager_probe";
const localUri =
  process.env.NEXUM_VERIFY_LOCAL_MONGODB_URI ??
  "mongodb://localhost:27017/admin";
const atlasUri = process.env.NEXUM_VERIFY_ATLAS_MONGODB_URI;
const requireLocal = process.env.NEXUM_VERIFY_REQUIRE_LOCAL === "1";
const requireAtlas = process.env.NEXUM_VERIFY_REQUIRE_ATLAS === "1";
const metadataPath =
  process.env.NEXUM_CONNECTIONS_JSON ?? getDefaultConnectionsJsonPath();

const results = [];

const record = (status, label, detail) => {
  results.push({ detail, label, status });
  const marker =
    status === "pass" ? "PASS" : status === "skip" ? "SKIP" : "FAIL";
  console.log(`${marker} ${label}${detail ? `: ${detail}` : ""}`);
};

const redactMongoUri = (value) =>
  value.replace(
    /mongodb(?:\+srv)?:\/\/(?:[^:@/?#]+(?::[^@/?#]*)?@)?/gi,
    (prefix) => (prefix.includes("@") ? "mongodb://[REDACTED]@" : prefix),
  );

async function pingMongo(label, uri, required) {
  if (!uri) {
    record(
      required ? "fail" : "skip",
      label,
      "set the matching NEXUM_VERIFY_*_MONGODB_URI env var",
    );
    return;
  }

  const client = new MongoClient(uri, {
    appName: "Nexum Connection Manager Verify",
    serverSelectionTimeoutMS: 5000,
  });

  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    record("pass", label, redactMongoUri(uri));
  } catch (error) {
    record(
      required ? "fail" : "skip",
      label,
      error instanceof Error ? redactMongoUri(error.message) : "unknown error",
    );
  } finally {
    await client.close(true).catch(() => {});
  }
}

async function verifyKeychainRoundTrip() {
  const probeUri = "mongodb://verify-user:verify-secret@localhost:27017/admin";

  try {
    await keytar.setPassword(keychainService, probeAccount, probeUri);
    const storedUri = await keytar.getPassword(keychainService, probeAccount);

    if (storedUri !== probeUri) {
      record("fail", "Keychain URI roundtrip", "stored value did not match");
      return;
    }

    record("pass", "Keychain URI roundtrip", keychainService);
  } catch (error) {
    record(
      "fail",
      "Keychain URI roundtrip",
      error instanceof Error ? error.message : "unknown error",
    );
  } finally {
    await keytar.deletePassword(keychainService, probeAccount).catch(() => {});
  }
}

function verifyNoPlainJsonUri() {
  if (!fs.existsSync(metadataPath)) {
    record(
      "pass",
      "Plain JSON URI scan",
      `metadata file not present: ${metadataPath}`,
    );
    return;
  }

  const content = fs.readFileSync(metadataPath, "utf8");
  const hasMongoUri = /mongodb(?:\+srv)?:\/\//i.test(content);
  const hasUriKey = /"uri"\s*:/i.test(content);

  if (hasMongoUri || hasUriKey) {
    record(
      "fail",
      "Plain JSON URI scan",
      `secret-like value found in ${metadataPath}`,
    );
    return;
  }

  record("pass", "Plain JSON URI scan", metadataPath);
}

function getDefaultConnectionsJsonPath() {
  if (process.platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "@nexum",
      "desktop",
      "connections.json",
    );
  }

  if (process.platform === "win32") {
    return path.join(
      process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"),
      "@nexum",
      "desktop",
      "connections.json",
    );
  }

  return path.join(
    process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"),
    "@nexum",
    "desktop",
    "connections.json",
  );
}

await pingMongo("Local MongoDB ping", localUri, requireLocal);
await pingMongo("MongoDB Atlas ping", atlasUri, requireAtlas);
await verifyKeychainRoundTrip();
verifyNoPlainJsonUri();

const hasFailures = results.some((result) => result.status === "fail");

if (hasFailures) {
  process.exitCode = 1;
}
