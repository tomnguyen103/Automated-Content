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
  await expect(page.getByRole("link", { name: "Plan" })).toHaveAttribute("href", "#plan");
  await expect(page.getByRole("link", { name: "Usage" })).toHaveAttribute("href", "#usage");
  await expect(page.getByRole("button", { name: "Invoices is not available yet" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Upgrade is not available yet" })).toBeDisabled();

  await page.screenshot({
    path: testInfo.outputPath(`billing-${testInfo.project.name}.png`),
    fullPage: true
  });
});

test("brand memory workbench shows review evidence", async ({ page }, testInfo) => {
  await page.goto("/brand-memory");

  await expect(page.getByRole("heading", { name: "Brand Memory" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Proposals" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Curator 2.0" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Review detail" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Inferred rule" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Original text" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Edited text" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Evidence" })).toBeVisible();
  await expect(page.getByLabel("Page navigation").getByRole("link", { name: "Billing" })).toHaveAttribute("href", "/billing");
  await expect(page.getByRole("link", { name: "Reset" })).toHaveAttribute("href", "/brand-memory");

  await page.screenshot({
    path: testInfo.outputPath(`brand-memory-${testInfo.project.name}.png`),
    fullPage: true
  });
});
