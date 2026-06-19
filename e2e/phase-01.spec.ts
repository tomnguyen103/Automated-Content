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

test("marketing page communicates the product value", async ({ page }, testInfo) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Turn one topic into a week of polished content." })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Start creating/ })).toBeVisible();
  await expect(page.getByText("Plan once, adapt everywhere")).toBeVisible();

  await page.screenshot({
    path: testInfo.outputPath(`marketing-${testInfo.project.name}.png`),
    fullPage: true
  });
});

test("dashboard shell supports desktop and mobile navigation", async ({ page, isMobile }, testInfo) => {
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Page navigation" })).toBeVisible();

  if (isMobile) {
    const mobileMenuButton = page.getByLabel("Open navigation");

    await mobileMenuButton.click();
    await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Calendar" })).toBeVisible();

    await page.screenshot({
      path: testInfo.outputPath(`dashboard-menu-${testInfo.project.name}.png`),
      fullPage: true
    });

    await mobileMenuButton.click();
    await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeHidden();
  } else {
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Calendar" })).toBeVisible();
  }

  await page.screenshot({
    path: testInfo.outputPath(`dashboard-${testInfo.project.name}.png`),
    fullPage: true
  });
});
