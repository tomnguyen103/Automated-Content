import { expect, test } from "@playwright/test";

const consoleIssues: string[] = [];

test.beforeEach(({ page }) => {
  consoleIssues.length = 0;

  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      consoleIssues.push(`${message.type()}: ${message.text()}`);
    }
  });

  page.on("pageerror", (error) => {
    consoleIssues.push(`pageerror: ${error.message}`);
  });
});

test.afterEach(() => {
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
