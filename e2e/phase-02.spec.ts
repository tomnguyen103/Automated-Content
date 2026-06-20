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

test("billing page shows plan and usage state", async ({ page }, testInfo) => {
  await page.goto("/billing");

  await expect(page.getByRole("heading", { name: "Billing" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Free" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Premium" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Usage state" })).toBeVisible();
  await expect(page.getByText("Premium limit: 7 posts/day")).toBeVisible();
  await expect(page.getByRole("heading", { name: "AI generations" })).toBeVisible();

  await page.screenshot({
    path: testInfo.outputPath(`billing-${testInfo.project.name}.png`),
    fullPage: true
  });
});
