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

test("auto replies supports rule creation, inbox matching, approval, and logs", async ({ page }, testInfo) => {
  await page.goto("/auto-replies");

  await expect(page.getByRole("heading", { name: "Auto Replies" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Keyword rule" })).toBeVisible();

  await page.getByLabel("Rule name").fill("Pricing keyword");
  await page.getByLabel("Keywords").fill("pricing, cost");
  await page.getByLabel("Reply template").fill("Thanks {firstName}. Premium includes keyword replies.");
  await page.getByRole("button", { name: "Create rule" }).click();

  await expect(page.getByRole("heading", { name: "Active rules" })).toBeVisible();
  await expect(page.getByText("Pricing keyword")).toBeVisible();

  await page.getByRole("button", { name: "Run rules" }).click();

  await expect(page.getByText("Thanks Rina. Premium includes keyword replies.")).toBeVisible();
  await expect(page.getByText("2 pending")).toBeVisible();

  await page.getByRole("button", { name: "Approve suggestion" }).first().click();

  await expect(page.getByText("1 pending")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Reply log" })).toBeVisible();
  await expect(page.getByText("Manual approval")).toBeVisible();
  const replyLog = page.getByRole("region", { name: "Reply log" });
  await expect(replyLog.getByText("Sent", { exact: true })).toHaveCount(2);

  await page.screenshot({
    path: testInfo.outputPath(`auto-replies-${testInfo.project.name}.png`),
    fullPage: true
  });
});
