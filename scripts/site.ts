import type { Browser, BrowserContextOptions, Page } from "@playwright/test";

// What the quality scripts share: a signed-in page of the development user
// on a local server, and a caller of the site's routes with its cookies.

export type Answer = { status: number; json: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
export type Call = (
  method: "get" | "post" | "put" | "patch" | "delete",
  path: string,
  data?: object,
) => Promise<Answer>;

export async function signedIn(
  browser: Browser,
  base: string,
  options: BrowserContextOptions = {},
): Promise<{ page: Page; call: Call }> {
  const page = await (await browser.newContext(options)).newPage();
  await page.goto(`${base}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Sign in as dev user/i }).click();
  await page.waitForURL("**/home", { timeout: 120_000 });
  const call: Call = async (method, path, data) => {
    const answer = await page.request[method](
      `${base}/api/v1${path}`,
      data ? { data } : undefined,
    );
    const text = await answer.text();
    try {
      return { status: answer.status(), json: JSON.parse(text) };
    } catch {
      return { status: answer.status(), json: null };
    }
  };
  return { page, call };
}
