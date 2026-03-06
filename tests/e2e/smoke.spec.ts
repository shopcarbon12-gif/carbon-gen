import { expect, test } from "@playwright/test";

test.describe("Carbon app smoke tests", () => {
  test("login page renders and validates empty submit", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "CARBON" })).toBeVisible();

    await page.getByRole("button", { name: "Authenticate" }).click();
    await expect(page.getByText("Enter your username.")).toBeVisible();
  });

  test("studio pages respond", async ({ page }) => {
    const images = await page.goto("/studio/images");
    expect(images?.ok()).toBeTruthy();
    await expect(page).toHaveTitle(/Carbon Creative Studio/i);

    const gemini = await page.goto("/studio/gemini-generator");
    expect(gemini?.ok()).toBeTruthy();
    await expect(page).toHaveTitle(/Carbon Creative Studio/i);
  });

  test("health endpoint is up", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
