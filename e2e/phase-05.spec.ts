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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("media page supports mocked upload, browse, select, and transform preview", async ({ page }, testInfo) => {
  const assetName = `phase-five-card-${testInfo.project.name}`;
  const assetPattern = new RegExp(escapeRegExp(assetName));

  await page.goto("/media");

  await expect(page.getByRole("heading", { name: "Media" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await expect(page.getByRole("link", { name: "AI Transforms" })).toHaveAttribute("href", "#transforms");
  await expect(page.getByRole("link", { name: "Platform Crops" })).toHaveAttribute("href", "#crops");

  await page.getByLabel("Upload media file").setInputFiles({
    name: `${assetName}.png`,
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lwqW9QAAAABJRU5ErkJggg==",
      "base64"
    )
  });

  const uploadedCard = page.getByRole("button", { name: assetPattern });

  await expect(uploadedCard).toBeVisible();
  await uploadedCard.click();

  await expect(page.getByRole("heading", { name: "Transform preview" })).toBeVisible();
  await expect(page.getByText("1 x 1", { exact: true })).toBeVisible();

  await page.getByLabel("Platform crop").selectOption("tiktok");
  await expect(page.getByText(/tr:w-1080,h-1920/)).toBeVisible();

  await page.getByRole("link", { name: "Create" }).first().click();
  await expect(page.getByRole("heading", { name: "Create" })).toBeVisible();

  await page.getByRole("button", { name: "Run workflow" }).click();
  await expect(page.getByText("awaiting_review")).toBeVisible();

  const composerAsset = page.getByRole("button", { name: assetPattern });

  await expect(composerAsset).toBeVisible();
  await composerAsset.click();
  await expect(page.getByText(assetName, { exact: true }).first()).toBeVisible();

  await page.screenshot({
    path: testInfo.outputPath(`media-${testInfo.project.name}.png`),
    fullPage: true
  });
});
