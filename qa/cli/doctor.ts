import {
  assertProductionReadOnly,
  assertQaWritesAllowed,
  fingerprintDatabaseUrl,
  readQaEnvironment,
} from "../runtime/environment";

const environment = readQaEnvironment();
const writeMode = environment.target !== "production-readonly";

if (writeMode) {
  assertQaWritesAllowed(environment);
} else {
  assertProductionReadOnly(environment);
}

process.stdout.write(
  `${JSON.stringify(
    {
      status: "ready",
      target: environment.target,
      baseUrl: environment.baseUrl.origin,
      runId: environment.runId,
      writesAllowed: writeMode,
      databaseFingerprint:
        writeMode && environment.databaseUrl
          ? fingerprintDatabaseUrl(environment.databaseUrl)
          : null,
    },
    null,
    2,
  )}\n`,
);

