import { fingerprintDatabaseUrl } from "../runtime/environment";

const databaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("qa:fingerprint requires DIRECT_URL or DATABASE_URL.");
}

process.stdout.write(`${fingerprintDatabaseUrl(databaseUrl)}\n`);

