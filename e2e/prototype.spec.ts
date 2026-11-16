import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { sampleTrip } from "../src/features/prototype/sample-trip";

// Walkthrough of the design-review prototype under /prototype. It uses sample
// data only: no sign-in, no database. Untagged on purpose, so QA runs that
// select @critical or @nightly tests do not pick it up.

const routes = [
  "/prototype",
  "/prototype/new",
  "/prototype/trip",
  "/prototype/trip?photos=off",
  "/prototype/quick-plan",
  "/prototype/profile",
];
const firstSet = sampleTrip.proposals["d2-morning"][0].map(
  (id) => sampleTrip.places[id].name,
);
const postcards = (page: Page) => page.locator('[data-qa="postcard"]');
const itinerary = (page: Page) => page.locator('[data-qa="live-itinerary"]');

async function openTrip(page: Page, query = "") {
  await page.goto(`/prototype/trip${query}`);
  await page
    .locator('[data-qa="prototype-workspace"][data-ready="true"]')
    .waitFor();
}

/** On a phone the itinerary sits behind a toggle; on a wide screen it is always shown. */
async function showItinerary(page: Page) {
  const toggle = page.locator('[data-qa="itinerary-toggle"]');
  if (
    (await toggle.isVisible()) &&
    (await toggle.getAttribute("aria-expanded")) !== "true"
  ) {
    await toggle.click();
  }
}

async function pickFirst(page: Page) {
  await postcards(page).first().getByRole("button", { name: "Pick" }).click();
  await expect(itinerary(page)).toContainText(firstSet[0]);
}

async function noSidewaysScroll(page: Page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
}

test.describe("prototype walkthrough", () => {
  test("walks from Home to a picked card", async ({ page }) => {
    await page.goto("/prototype");
    await page.getByRole("link", { name: "New trip" }).click();
    await page.getByRole("radio", { name: /Plan it together/ }).click();
    await page.getByRole("link", { name: "Start planning together" }).click();
    await page
      .locator('[data-qa="prototype-workspace"][data-ready="true"]')
      .waitFor();

    const card = postcards(page).first();
    const flip = card.getByRole("button", { name: /Flip card/ });
    await flip.focus();
    await page.keyboard.press("Enter");
    await expect(flip).toHaveAttribute("aria-pressed", "true");
    // The back is announced only once the card is flipped.
    await expect(card.locator('[aria-live="polite"]')).toContainText(
      "Why it suits you",
    );

    await pickFirst(page);
  });

  test("asks for others with a reason", async ({ page }) => {
    await openTrip(page);
    await page.getByRole("button", { name: "Show me others" }).click();
    await page.getByRole("button", { name: "Too far" }).click();
    await page.getByRole("button", { name: "Show new places" }).click();

    await expect(page.getByText(/Noted: too far/)).toBeVisible();
    for (const name of firstSet) {
      await expect(postcards(page).filter({ hasText: name })).toHaveCount(0);
    }
  });

  test("says so when a slot runs out of places", async ({ page }) => {
    await openTrip(page);
    const sets = sampleTrip.proposals["d2-morning"].length;
    for (let i = 0; i < sets; i += 1) {
      await page.getByRole("button", { name: "Show me others" }).click();
      await page.getByRole("button", { name: "Show new places" }).click();
    }
    await expect(postcards(page)).toHaveCount(0);
    await expect(
      page.getByText("I have no more places for this slot."),
    ).toBeVisible();
  });

  test("moves an item by keyboard, flags it, and undoes", async ({ page }) => {
    await openTrip(page);
    await pickFirst(page);
    await showItinerary(page);

    const flag = sampleTrip.moveFlags["senso-ji@d1-dinner"];
    const move = page.getByLabel(`Move ${firstSet[0]} to…`);
    await move.focus();
    const steps = await move
      .locator("option")
      .evaluateAll(
        (options, label) =>
          options.findIndex((option) => option.textContent === label),
        "Day 1 · 19:30 Dinner",
      );
    for (let i = 0; i < steps; i += 1) await page.keyboard.press("ArrowDown");

    // Arrowing through the list must not move anything by itself.
    await expect(move).toBeFocused();
    await expect(itinerary(page).getByText(flag)).toHaveCount(0);

    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(itinerary(page).getByText(flag)).toBeVisible();

    await page.getByRole("button", { name: "Undo" }).click();
    await expect(itinerary(page).getByText(flag)).toHaveCount(0);
  });

  test("a pick animates without errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await openTrip(page);
    await pickFirst(page);
    // An aborted view transition rejects a moment after the pick lands.
    await page.waitForTimeout(700);
    expect(errors).toEqual([]);
  });

  test("the agent's italic is a real italic face", async ({ page }) => {
    await openTrip(page);
    const italic = await page.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts].some(
        (face) =>
          /fraunces/i.test(face.family) &&
          face.style === "italic" &&
          face.status === "loaded",
      );
    });
    expect(italic).toBe(true);
  });

  test("booked items cannot be moved or removed", async ({ page }) => {
    await openTrip(page);
    const booked = itinerary(page)
      .locator("li")
      .filter({ has: page.locator('[data-qa="ticket-stub"]') })
      .first();
    await expect(booked).toHaveCount(1);
    await expect(booked.getByRole("combobox")).toHaveCount(0);
    await expect(booked.getByRole("button", { name: /Remove/ })).toHaveCount(0);
  });

  for (const look of ["enlarged", "overlay"]) {
    test(`closer look (${look}) traps focus and closes on Escape`, async ({
      page,
    }) => {
      await openTrip(page, `?look=${look}`);
      const opener = postcards(page)
        .first()
        .getByRole("button", { name: "Closer look" });
      await opener.focus();
      await page.keyboard.press("Enter");

      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog.locator(":focus")).toHaveCount(1);

      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(opener).toBeFocused();
    });
  }

  test("keeps picks after a reload", async ({ page }) => {
    await openTrip(page);
    await pickFirst(page);
    await page.reload();
    await page
      .locator('[data-qa="prototype-workspace"][data-ready="true"]')
      .waitFor();
    await expect(itinerary(page)).toContainText(firstSet[0]);
  });

  test("picking works without view transitions", async ({ page }) => {
    await page.addInitScript(() => {
      delete (Document.prototype as { startViewTransition?: unknown })
        .startViewTransition;
    });
    await openTrip(page);
    expect(await page.evaluate(() => "startViewTransition" in document)).toBe(
      false,
    );
    await pickFirst(page);
  });

  test("picking works with reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openTrip(page);
    await pickFirst(page);
  });

  test("Quick plan builds from step 1 alone", async ({ page }) => {
    await page.goto("/prototype/quick-plan");
    await page.locator('[data-qa="trip-brief"][data-ready="true"]').waitFor();
    await page.getByLabel("City 1", { exact: true }).fill("Tokyo");
    await page.getByLabel("Nights in city 1").fill("3");
    await page.getByLabel("Start date").fill("2027-05-10");
    await page.getByLabel("Travellers").fill("1");
    const next = page.getByRole("button", { name: "Next", exact: true });
    for (let step = 2; step <= 5; step += 1) {
      await next.click();
      await expect(page.locator('[data-qa="brief-progress"]')).toContainText(
        `Step ${step} of 5`,
      );
    }
    await page.getByRole("button", { name: "Build my trip" }).click();

    await expect(page).toHaveURL(/built=1/, { timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: "What I assumed" }),
    ).toBeVisible();
  });

  test("no page scrolls sideways and long names wrap", async ({ page }) => {
    for (const route of routes) {
      await page.goto(route);
      await noSidewaysScroll(page);
    }

    const longName = Object.values(sampleTrip.places).find(
      (place) => place.name.length >= 45,
    )!.name;
    await openTrip(page);
    await showItinerary(page);
    await page
      .getByRole("button", { name: "Choose Day 3 · 14:30 Afternoon" })
      .click();
    await page.getByRole("button", { name: "Show me others" }).click();
    await page.getByRole("button", { name: "Show new places" }).click();

    const card = postcards(page).filter({ hasText: longName });
    await expect(card).toHaveCount(1);
    expect(await card.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
      true,
    );
    await noSidewaysScroll(page);
  });

  test("has no serious accessibility violations", async ({ page }) => {
    for (const route of routes) {
      await page.goto(route);
      await page.getByRole("navigation", { name: "Main" }).waitFor();
      const results = await new AxeBuilder({ page })
        .exclude("nextjs-portal")
        .analyze();
      const serious = results.violations
        .filter((v) => v.impact === "serious" || v.impact === "critical")
        .map((v) => `${route}: ${v.id} (${v.nodes.length})`);
      expect(serious).toEqual([]);
    }
  });
});
