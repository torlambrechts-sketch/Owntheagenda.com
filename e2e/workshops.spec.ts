import { test, expect } from "@playwright/test";

// Seeded sample workshop in the E2E Sandbox (see fixture).
const SAMPLE_WORKSHOP = "ee2e0000-0000-4000-8000-000000000030";

test.describe("Workshops design migration", () => {
  test("home shows Build + New workshop actions", async ({ page }) => {
    await page.goto("/workshops");
    await expect(page.getByRole("heading", { name: "Workshops" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Build workshop/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /New workshop/ })).toBeVisible();
  });

  test("New workshop opens the slide-over with the three start-point cards", async ({ page }) => {
    await page.goto("/workshops");
    await page.getByRole("button", { name: /New workshop/ }).click();
    await expect(page.getByText("Start point")).toBeVisible();
    await expect(page.getByText("From assessment")).toBeVisible();
    await expect(page.getByText("From template")).toBeVisible();
    await expect(page.getByText("Blank", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Create workshop/ })).toBeVisible();
  });

  test("Build workshop navigates straight to the builder (regression)", async ({ page }) => {
    await page.goto("/workshops");
    await page.getByRole("button", { name: /Build workshop/ }).click();
    // Lands on the builder route /workshops/<uuid> — NOT a side window.
    await page.waitForURL(/\/workshops\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Board" })).toBeVisible();

    // Best-effort cleanup so the sandbox doesn't accumulate empty drafts.
    const id = page.url().split("/").pop();
    try {
      page.on("dialog", (d) => d.accept());
      await page.goto("/workshops");
      const row = page.locator(`a[href="/workshops/${id}"]`).first();
      await row.locator("xpath=ancestor::*[contains(@class,'wa-row')]").getByRole("button", { name: /Workshop actions/ }).click();
      await page.getByRole("button", { name: "Delete" }).click();
    } catch {
      /* cleanup is best-effort; the E2E sandbox is isolated */
    }
  });

  test("builder Board view renders the five phase columns + sample blocks", async ({ page }) => {
    await page.goto(`/workshops/${SAMPLE_WORKSHOP}`);
    await expect(page.getByRole("button", { name: "Board" })).toBeVisible();
    for (const phase of ["Open", "Diverge", "Converge", "Decide", "Close"]) {
      await expect(page.locator(".wb-col-t", { hasText: new RegExp(`^${phase}$`) })).toBeVisible();
    }
    await expect(page.locator(".wb-card", { hasText: "Check-in" })).toBeVisible();
    await expect(page.locator(".wb-card", { hasText: "Dot vote" })).toBeVisible();
  });

  test("builder block editor exposes the Phase + Owner fields", async ({ page }) => {
    await page.goto(`/workshops/${SAMPLE_WORKSHOP}`);
    await page.locator(".wb-card", { hasText: "Dot vote" }).click();
    await expect(page.getByText("Phase", { exact: true })).toBeVisible();
    await expect(page.locator('label:has-text("Owner")')).toBeVisible();
  });

  test("run launcher renders workshop list, role toggle and dry-run", async ({ page }) => {
    await page.goto("/workshops/run");
    await expect(page.getByRole("heading", { name: "Run a workshop" })).toBeVisible();
    await expect(page.getByText("E2E Sample Workshop")).toBeVisible();
    await expect(page.getByText("Facilitator")).toBeVisible();
    await expect(page.getByText("Dry run")).toBeVisible();
  });
});
