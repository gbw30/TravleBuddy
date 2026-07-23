import { expect, test } from "@playwright/test";
import {
  attackerStatePath,
  fixtureManifest,
  ownerStatePath,
} from "./support";

test.describe("unauthenticated authorization", () => {
  test("@critical protected pages redirect to login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?callbackUrl=/);
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
  });

  test("@critical protected APIs return 401", async ({ request }) => {
    const response = await request.get("/api/trips");
    expect(response.status()).toBe(401);
  });
});

test.describe("owner authorization", () => {
  test.use({ storageState: ownerStatePath });

  test("@critical signed session reaches the dashboard and owned trip", async ({
    page,
  }) => {
    const manifest = await fixtureManifest();
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /welcome/i })).toBeVisible();

    const response = await page.goto(`/trips/${manifest.ownerTripId}`);
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { name: new RegExp(manifest.runId, "i") }),
    ).toBeVisible();
  });
});

test.describe("cross-user authorization", () => {
  test.use({ storageState: attackerStatePath });

  test("@critical another user cannot infer an owned trip", async ({ page }) => {
    const manifest = await fixtureManifest();
    const response = await page.goto(`/trips/${manifest.ownerTripId}`);

    expect(response?.status()).toBe(404);
    await expect(page.getByText(new RegExp(manifest.runId, "i"))).toHaveCount(0);
  });
});

