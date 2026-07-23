import { expect, test } from "@playwright/test";
import { enforceReadOnlyPage, ownerStatePath } from "./support";

test.describe("production read-only smoke", () => {
  test("@production-readonly public and protected routing are healthy", async ({
    browser,
  }) => {
    const publicContext = await browser.newContext();
    const publicPage = await publicContext.newPage();
    await enforceReadOnlyPage(publicPage);

    const homeResponse = await publicPage.goto("/");
    expect(homeResponse?.ok()).toBe(true);
    await publicPage.goto("/dashboard");
    await expect(publicPage).toHaveURL(/\/login\?callbackUrl=/);
    await publicContext.close();
  });

  test("@production-readonly synthetic user can read the dashboard", async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: ownerStatePath });
    const page = await context.newPage();
    await enforceReadOnlyPage(page);

    const response = await page.goto("/dashboard");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: /welcome/i })).toBeVisible();
    await context.close();
  });
});

