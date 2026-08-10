import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "../../src/lib/db";
import type { QaEnvironment } from "./environment";
import { assertQaWritesAllowed } from "./environment";

const qaEmailDomain = "travlebuddy.invalid";
const ephemeralPrefix = "qa-run-";
const baselineOwnerId = "qa-baseline-owner";
const baselineTripId = "qa-baseline-trip";

export const qaFixtureAliases = Object.freeze({
  owner: "qa-owner",
  intruder: "qa-intruder",
  ownerTrip: "qa-owner-ready-trip",
  intruderTrip: "qa-intruder-draft-trip",
} as const);

export type QaFixtureUser = {
  id: string;
  email: string;
  name: string;
};

export type QaFixtureManifest = {
  version: 1;
  runId: string;
  target: "local" | "preview";
  createdAt: string;
  retainUntil: string;
  aliases: typeof qaFixtureAliases;
  owner: QaFixtureUser;
  attacker: QaFixtureUser;
  ownerTripId: string;
  attackerTripId: string;
};

export function safeRunId(value: string) {
  const safe = value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "")
    .slice(0, 48);

  if (safe.length < 3) {
    throw new Error("QA_RUN_ID must contain at least three safe characters.");
  }

  return safe;
}

export function qaResultsDirectory(runId: string) {
  return path.resolve(process.cwd(), "qa-results", safeRunId(runId));
}

export function qaFixtureManifestPath(runId: string) {
  return path.join(qaResultsDirectory(runId), "fixtures.json");
}

function addUtcDays(value: Date, days: number) {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function ephemeralEmail(runId: string, role: "owner" | "attacker") {
  return `${ephemeralPrefix}${safeRunId(runId)}-${role}@${qaEmailDomain}`;
}

async function deleteUsersByExactIdentity(
  users: readonly Pick<QaFixtureUser, "id" | "email">[],
) {
  for (const expected of users) {
    const actual = await db.user.findUnique({
      where: { id: expected.id },
      select: { id: true, email: true },
    });

    if (!actual) continue;
    if (actual.email !== expected.email || !actual.email?.startsWith(ephemeralPrefix)) {
      throw new Error(`Refusing to delete non-ephemeral QA user ${expected.id}.`);
    }

    await db.user.delete({ where: { id: actual.id } });
  }
}

async function removeExistingRunUsers(runId: string) {
  const emails = [
    ephemeralEmail(runId, "owner"),
    ephemeralEmail(runId, "attacker"),
  ];
  const existing = await db.user.findMany({
    where: { email: { in: emails } },
    select: { id: true, email: true },
  });

  await deleteUsersByExactIdentity(
    existing.flatMap((user) =>
      user.email ? [{ id: user.id, email: user.email }] : [],
    ),
  );
}

export async function seedQaFixtures(environment: QaEnvironment) {
  assertQaWritesAllowed(environment);

  if (environment.target === "production-readonly") {
    throw new Error("QA fixture creation is forbidden for production targets.");
  }

  const target = environment.target;
  const runId = safeRunId(environment.runId);
  await removeExistingRunUsers(runId);

  const startDate = addUtcDays(new Date(), 30);
  const endDate = addUtcDays(startDate, 3);
  const ownerEmail = ephemeralEmail(runId, "owner");
  const attackerEmail = ephemeralEmail(runId, "attacker");

  const owner = await db.user.create({
    data: {
      name: "TravleBuddy QA Owner",
      email: ownerEmail,
      travelPreference: {
        create: {
          budgetLevel: "MODERATE",
          pace: "BALANCED",
          interests: ["FOOD", "HISTORY"],
          transportationModes: ["WALKING", "PUBLIC_TRANSIT"],
          accommodationTypes: ["HOTEL"],
          walkingToleranceKm: 5,
          dietaryRestrictions: ["Vegetarian"],
        },
      },
      trips: {
        create: {
          title: `QA ${runId} Paris planning trip`,
          status: "PLANNING",
          departureCity: "Bogota",
          departureCountry: "Colombia",
          departureTimeZone: "America/Bogota",
          startDate,
          endDate,
          budgetAmount: 2400,
          budgetCurrency: "USD",
          logisticsMode: "FLEXIBLE",
          destinations: {
            create: {
              city: "Paris",
              country: "France",
              timeZone: "Europe/Paris",
              sortOrder: 0,
            },
          },
          preference: {
            create: {
              budgetLevel: "MODERATE",
              pace: "BALANCED",
              interests: ["FOOD", "HISTORY"],
              transportationModes: ["WALKING", "PUBLIC_TRANSIT"],
              accommodationTypes: ["HOTEL"],
              hotelPriority: 7,
              walkingToleranceKm: 5,
              dietaryRestrictions: ["Vegetarian"],
              accessibilityNeeds: [],
              mustAvoid: ["Overnight buses"],
            },
          },
        },
      },
    },
    select: {
      id: true,
      email: true,
      name: true,
      trips: { select: { id: true }, take: 1 },
    },
  });

  const attacker = await db.user.create({
    data: {
      name: "TravleBuddy QA Attacker",
      email: attackerEmail,
      trips: {
        create: {
          title: `QA ${runId} attacker draft`,
          status: "DRAFT",
        },
      },
    },
    select: {
      id: true,
      email: true,
      name: true,
      trips: { select: { id: true }, take: 1 },
    },
  });

  if (!owner.email || !owner.name || !owner.trips[0] || !attacker.email || !attacker.name || !attacker.trips[0]) {
    throw new Error("QA fixture creation returned incomplete records.");
  }

  const now = new Date();
  const manifest: QaFixtureManifest = {
    version: 1,
    runId,
    target,
    createdAt: now.toISOString(),
    retainUntil: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    aliases: qaFixtureAliases,
    owner: { id: owner.id, email: owner.email, name: owner.name },
    attacker: {
      id: attacker.id,
      email: attacker.email,
      name: attacker.name,
    },
    ownerTripId: owner.trips[0].id,
    attackerTripId: attacker.trips[0].id,
  };

  const directory = qaResultsDirectory(runId);
  await mkdir(directory, { recursive: true });
  await writeFile(
    qaFixtureManifestPath(runId),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  return manifest;
}

export async function readQaFixtureManifest(runId: string) {
  return JSON.parse(
    await readFile(qaFixtureManifestPath(runId), "utf8"),
  ) as QaFixtureManifest;
}

export async function cleanupQaFixtures(
  environment: QaEnvironment,
  manifest: QaFixtureManifest,
) {
  assertQaWritesAllowed(environment);

  if (safeRunId(environment.runId) !== manifest.runId) {
    throw new Error("Fixture manifest does not belong to the active QA run.");
  }

  await deleteUsersByExactIdentity([manifest.owner, manifest.attacker]);
}

export async function cleanupExpiredQaFixtures(environment: QaEnvironment) {
  assertQaWritesAllowed(environment);
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const expired = await db.user.findMany({
    where: {
      email: { startsWith: ephemeralPrefix },
      createdAt: { lt: cutoff },
    },
    select: { id: true, email: true },
  });
  const exactUsers = expired.flatMap((user) =>
    user.email ? [{ id: user.id, email: user.email }] : [],
  );

  await deleteUsersByExactIdentity(exactUsers);
  return exactUsers.length;
}

export async function resetPreviewBaseline(environment: QaEnvironment) {
  assertQaWritesAllowed(environment);

  if (environment.target !== "preview") {
    throw new Error("Stable QA baselines are supported only in preview.");
  }

  const startDate = addUtcDays(new Date(), 45);
  const endDate = addUtcDays(startDate, 2);

  await db.user.upsert({
    where: { id: baselineOwnerId },
    update: {
      name: "TravleBuddy QA Baseline",
      email: `qa-baseline@${qaEmailDomain}`,
    },
    create: {
      id: baselineOwnerId,
      name: "TravleBuddy QA Baseline",
      email: `qa-baseline@${qaEmailDomain}`,
    },
  });
  await db.trip.deleteMany({ where: { id: baselineTripId, userId: baselineOwnerId } });
  await db.trip.create({
    data: {
      id: baselineTripId,
      userId: baselineOwnerId,
      title: "QA Baseline Paris Trip",
      status: "PLANNING",
      startDate,
      endDate,
      budgetAmount: 1800,
      budgetCurrency: "USD",
      destinations: {
        create: {
          city: "Paris",
          country: "France",
          timeZone: "Europe/Paris",
          sortOrder: 0,
        },
      },
      preference: {
        create: {
          budgetLevel: "MODERATE",
          pace: "BALANCED",
          interests: ["FOOD"],
          transportationModes: ["WALKING"],
        },
      },
    },
  });

  return { userId: baselineOwnerId, tripId: baselineTripId };
}
