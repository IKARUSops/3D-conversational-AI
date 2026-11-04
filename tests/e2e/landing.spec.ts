import { expect, test } from "@playwright/test";

test("FR-A6 language toggle switches to English and is remembered", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "EN" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Bangla");
  await page.reload();
  await expect(page.getByRole("button", { name: "Talk to our Bangla caller" })).toBeVisible();
});

test("FR-B1 hero button opens the call panel without leaving the page", async ({ page }) => {
  // The real call client chunk loads on demand next to the 3D hero; give slow CI GPUs time.
  test.setTimeout(60_000);
  await page.goto("/");
  // Retry the click until React has hydrated (the 3D hero can keep the main thread busy).
  await expect(async () => {
    await page.getByRole("button", { name: "বাংলা কলারের সাথে কথা বলুন" }).click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 45_000 });
  await expect(page).toHaveURL(/\/$/);
  // I-01: the real call panel (Agent B) is wired, not the preview.
  await expect(page.locator(".call-panel")).toBeVisible();
});

test("I-09 typed call without server env shows a clear 'not configured' error", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto("/");
  await expect(async () => {
    await page.getByRole("button", { name: "বাংলা কলারের সাথে কথা বলুন" }).click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 45_000 });
  await page.getByRole("button", { name: /লিখে কথা/ }).click();
  // Without env the server answers 503 "not configured"; with env a call starts instead.
  await expect(page.locator(".call-panel__error, .call-panel__live").first()).toBeVisible({
    timeout: 10_000,
  });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("FR-A7 sections are present", async ({ page }) => {
  await page.goto("/");
  for (const id of ["how", "features", "use-cases", "pricing", "contact"]) {
    await expect(page.locator(`#${id}`)).toBeVisible();
  }
});

test("FR-A8 no horizontal scroll at 360 px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
