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

test("agents control center creates, runs, pauses, and resumes missions", async ({ page }, testInfo) => {
  const missionTitle = `E2E agents mission ${testInfo.project.name}`;

  await page.goto("/agents");

  await expect(page.getByRole("heading", { name: "Agents" })).toBeVisible();
  await expect(page.getByText("coordinator", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mission builder" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Control" })).toHaveAttribute("href", "#control");
  await expect(page.getByRole("link", { name: "Missions", exact: true })).toHaveAttribute("href", "#missions");
  await expect(page.getByRole("link", { name: "Permissions", exact: true })).toHaveAttribute("href", "#permissions");
  await expect(page.getByRole("link", { name: "Activity", exact: true })).toHaveAttribute("href", "#activity");

  await page.getByRole("link", { name: "Missions", exact: true }).focus();
  await expect(page.getByRole("link", { name: "Missions", exact: true })).toBeFocused();
  await page.getByRole("link", { name: "Missions", exact: true }).click();
  await expect(page).toHaveURL(/#missions$/);

  await page.getByRole("textbox", { name: "Title" }).fill(missionTitle);
  await page.getByRole("textbox", { name: "Topic" }).fill("Autonomous content operations");
  await page.getByRole("textbox", { name: "Brief" }).fill(
    "Generate a local-preview content mission and keep the audit trail visible."
  );
  await page.getByRole("button", { name: "Create mission" }).click();

  const missionCard = page.locator("article").filter({ hasText: missionTitle }).first();
  await expect(missionCard).toBeVisible();
  await expect(missionCard.getByText("queued", { exact: true }).first()).toBeVisible();

  await missionCard.getByRole("button", { name: "Run" }).click();
  await expect(missionCard.getByText("succeeded", { exact: true }).first()).toBeVisible();
  await expect(missionCard.getByText("Generate platform variants", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Live activity" })).toBeVisible();

  await missionCard.getByRole("button", { name: "Pause" }).click();
  await expect(missionCard.getByText("paused", { exact: true }).first()).toBeVisible();

  await missionCard.getByRole("button", { name: "Resume" }).click();
  await expect(missionCard.getByText("queued", { exact: true }).first()).toBeVisible();

  await page.screenshot({
    path: testInfo.outputPath(`agents-${testInfo.project.name}.png`),
    fullPage: true
  });
});
