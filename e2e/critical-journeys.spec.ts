import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { fixtureManifest, ownerStatePath } from "./support";

test.describe("critical authenticated journeys", () => {
  test.use({ storageState: ownerStatePath });

  test("@critical creates a draft and persists it after reload", async ({ page }) => {
    const title = `QA browser draft ${process.env.QA_RUN_ID}`;
    await page.goto("/trips/new");
    await page.getByLabel("Title").fill(title);
    await page.getByRole("button", { name: "Save as draft" }).click();

    await expect(page).toHaveURL(/\/trips\/[^/]+$/);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  });

  test("@critical current planning surfaces load for a representative trip", async ({
    page,
  }) => {
    const manifest = await fixtureManifest();
    const checks = [
      [`/trips/${manifest.ownerTripId}/preferences`, /travel preferences/i],
      [`/trips/${manifest.ownerTripId}/logistics`, /logistics/i],
      [`/trips/${manifest.ownerTripId}/planning`, /planning/i],
      [`/trips/${manifest.ownerTripId}/itinerary`, /itinerary/i],
    ] as const;

    for (const [url, heading] of checks) {
      const response = await page.goto(url);
      expect(response?.status(), url).toBe(200);
      await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
    }
  });

  test("@nightly critical pages have no serious accessibility violations", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const blocking = results.violations.filter((violation) =>
      ["serious", "critical"].includes(violation.impact ?? ""),
    );

    expect(blocking).toEqual([]);
  });

  test("@nightly mobile-width pages do not overflow horizontally", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard");
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));

    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  });
});

