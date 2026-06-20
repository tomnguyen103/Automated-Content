import { expect, test as base } from "@playwright/test";

const test = base.extend<{ consoleIssues: string[] }>({
  consoleIssues: [
    async ({ page }, use) => {
      const consoleIssues: string[] = [];

      page.on("console", (message) => {
        if (message.type() === "error" || message.type() === "warning") {
          consoleIssues.push(`${message.type()}: ${message.text()}`);
        }
      });

      page.on("pageerror", (error) => {
        consoleIssues.push(`pageerror: ${error.message}`);
      });

      await use(consoleIssues);
    },
    { auto: true }
  ]
});

test.afterEach(({ consoleIssues }) => {
  expect(consoleIssues).toEqual([]);
});

test("analytics shows Phase 8 operational metrics", async ({ page }, testInfo) => {
  await page.goto("/analytics");

  await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();
  await expect(page.getByText("Posts tracked")).toBeVisible();
  await expect(page.getByText("Failures", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Replies", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Usage events")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Platform breakdown" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Usage history" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Agent activity" })).toBeVisible();

  await page.screenshot({
    path: testInfo.outputPath(`analytics-${testInfo.project.name}.png`),
    fullPage: true
  });
});
