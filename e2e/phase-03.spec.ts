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

test("create page generates a structured content pack", async ({ page }, testInfo) => {
  await page.goto("/create");

  await expect(page.getByRole("heading", { name: "Create" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Content brief" })).toBeVisible();

  await page.getByRole("button", { name: "Generate" }).click();

  await expect(page.getByText("succeeded")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Draft" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "LinkedIn Professional post" })).toBeVisible();
  await expect(page.getByText("save_draft")).toBeVisible();

  await page.screenshot({
    path: testInfo.outputPath(`create-${testInfo.project.name}.png`),
    fullPage: true
  });
});
