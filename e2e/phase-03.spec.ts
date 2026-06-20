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

test("create page generates a reviewable content workflow", async ({ page }, testInfo) => {
  await page.goto("/create");

  await expect(page.getByRole("heading", { name: "Create" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Content brief" })).toBeVisible();

  await page.getByRole("button", { name: "Run workflow" }).click();

  await expect(page.getByText("awaiting_review")).toBeVisible();
  await expect(page.getByText("Pending review")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Draft" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "LinkedIn Professional post" })).toBeVisible();
  await expect(page.getByText("save_draft")).toHaveCount(0);

  await page.getByRole("button", { name: "Approve" }).click();

  await expect(page.getByText("succeeded")).toHaveCount(2);
  await expect(page.getByText("save_draft")).toBeVisible();

  await page.screenshot({
    path: testInfo.outputPath(`create-${testInfo.project.name}.png`),
    fullPage: true
  });
});
