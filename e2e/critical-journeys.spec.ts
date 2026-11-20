import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { fixtureManifest, ownerStatePath } from "./support";

test.describe("critical authenticated journeys", () => {
  test.use({ storageState: ownerStatePath });

  test("@critical starts a trip, renames it, and keeps it after reload", async ({
    page,
  }) => {
    const title = `QA browser trip ${process.env.QA_RUN_ID}`;
    await page.goto("/trips/new");
    await page.getByRole("button", { name: "Start planning together" }).click();

    await expect(page).toHaveURL(/\/trips\/[^/]+$/);
    await expect(page.getByRole("heading", { name: "New trip" })).toBeVisible();
    await page.getByRole("button", { name: /^Rename/ }).click();
    await page.getByLabel("New name").fill(title);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  });

  test("@critical the trip page shows the plan, the facts and what is decided", async ({
    page,
  }) => {
    const manifest = await fixtureManifest();
    const response = await page.goto(`/trips/${manifest.ownerTripId}`);
    expect(response?.status()).toBe(200);

    await expect(page.locator('[data-qa="trip-workspace"]')).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "The facts" }),
    ).toBeVisible();
    await expect(page.locator('[data-qa="commitments"]')).toBeVisible();
  });

  test("@critical saving the facts keeps the conversation's answers", async ({
    page,
  }) => {
    const manifest = await fixtureManifest();
    await page.goto(`/trips/${manifest.ownerTripId}`);
    const waiting = page.getByRole("group", { name: "Who is travelling?" });
    await expect(waiting).toBeVisible();

    // The conversation sets the travellers after the page has loaded.
    await page.getByRole("button", { name: "Two adults and a child" }).click();
    await expect(waiting).toBeHidden();

    // The traveller then saves the facts with something else changed.
    const facts = page.getByRole("form", { name: "The facts" });
    await facts.getByLabel("Nights").fill("4");
    await facts.getByRole("button", { name: "Save the facts" }).click();
    await expect(facts.getByRole("status")).toHaveText("Saved.");
    await expect(facts.getByLabel("Nights")).toHaveValue("4");

    await page.reload();
    await expect(facts.getByLabel("Nights")).toHaveValue("4");
    await expect(facts.getByLabel("Adults")).toHaveValue("2");
    await expect(facts.getByLabel("Children")).toHaveValue("1");
    await expect(waiting).toBeHidden();
  });

  test("@nightly critical pages have no serious accessibility violations", async ({
    page,
  }) => {
    await page.goto("/home");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const blocking = results.violations.filter((violation) =>
      ["serious", "critical"].includes(violation.impact ?? ""),
    );

    expect(blocking).toEqual([]);
  });

  test("@nightly mobile-width pages do not overflow horizontally", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/home");
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));

    expect(dimensions.scrollWidth).toBeLessThanOrEqual(
      dimensions.clientWidth + 1,
    );
  });
});
