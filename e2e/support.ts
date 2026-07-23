import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Page } from "@playwright/test";
import { assertReadOnlyHttpMethod } from "../qa/runtime/environment";
import {
  qaFixtureManifestPath,
  type QaFixtureManifest,
} from "../qa/runtime/fixtures";

export const ownerStatePath =
  process.env.QA_OWNER_STATE_PATH ??
  path.resolve(".playwright-auth", "missing-owner.json");
export const attackerStatePath =
  process.env.QA_ATTACKER_STATE_PATH ??
  path.resolve(".playwright-auth", "missing-attacker.json");

export async function fixtureManifest() {
  const runId = process.env.QA_RUN_ID;

  if (!runId) throw new Error("E2E tests require QA_RUN_ID.");

  const file = qaFixtureManifestPath(runId);
  return JSON.parse(await readFile(file, "utf8")) as QaFixtureManifest;
}

export async function enforceReadOnlyPage(page: Page) {
  await page.route("**/*", async (route) => {
    const method = route.request().method().toUpperCase();

    try {
      assertReadOnlyHttpMethod(method);
    } catch (error) {
      await route.abort("blockedbyclient");
      throw error;
    }

    await route.continue();
  });
}
