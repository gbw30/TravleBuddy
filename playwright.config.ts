import { defineConfig, devices } from "@playwright/test";

const target = process.env.QA_TARGET ?? "local";
const baseURL = process.env.QA_BASE_URL ?? "http://127.0.0.1:3000";
const runId = process.env.QA_RUN_ID ?? "local-list";
const reportRoot = `qa-results/${runId}`;
const isLocal = target === "local";
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const serverMode = process.env.QA_WEB_SERVER_MODE === "start" ? "start" : "dev";
const serverUrl = new URL(baseURL);
const port = serverUrl.port || (serverUrl.protocol === "https:" ? "443" : "80");
const serverCommand =
  process.env.QA_WEB_SERVER_COMMAND ??
  `${npmCommand} run ${serverMode} -- --hostname ${serverUrl.hostname} --port ${port}`;
const automationBypassSecret =
  process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
const extraHTTPHeaders = automationBypassSecret
  ? {
      "x-vercel-protection-bypass": automationBypassSecret,
      "x-vercel-set-bypass-cookie": "true",
    }
  : undefined;

export default defineConfig({
  testDir: "./e2e",
  outputDir: `${reportRoot}/playwright-artifacts`,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ["line"],
    ["html", { outputFolder: `${reportRoot}/playwright-report`, open: "never" }],
    ["junit", { outputFile: `${reportRoot}/playwright-junit.xml` }],
  ],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    testIdAttribute: "data-qa",
    extraHTTPHeaders,
  },
  webServer: isLocal
    ? {
        command: serverCommand,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      }
    : undefined,
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
    { name: "mobile-safari", use: { ...devices["iPhone 15"] } },
  ],
});
