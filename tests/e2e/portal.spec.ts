import { expect, test } from "@playwright/test";

test("FR-D1 anonymous users are sent to the login page", async ({ page }) => {
  await page.goto("/portal/calls");
  await expect(page).toHaveURL(/\/portal\/login/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("FR-D1 login form validates input before calling Supabase", async ({ page }) => {
  await page.goto("/portal/login");
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByLabel("Password").fill("x");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert").last()).toBeVisible();
});
