import { expect, test } from "@playwright/test";

test("FR-A2 landing page renders the hero in Bangla by default", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("বাংলায়");
  await expect(page.getByRole("button", { name: "বাংলা কলারের সাথে কথা বলুন" })).toBeVisible();
});

test("health endpoint answers with JSON", async ({ request }) => {
  const res = await request.get("/api/health");
  const body = await res.json();
  expect(typeof body.ok).toBe("boolean");
  expect(typeof body.db).toBe("boolean");
});
