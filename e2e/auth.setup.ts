import { test as setup, expect } from "@playwright/test";

// Logs in through the real UI as the seeded, isolated E2E user and saves the
// session so the test specs run authenticated. The user (e2e@owntheagenda.test)
// is an owner of the throwaway "E2E Sandbox" workspace — no real data.
const EMAIL = process.env.E2E_EMAIL ?? "e2e@owntheagenda.test";
const PASSWORD = process.env.E2E_PASSWORD ?? "owntheagenda";
const STATE = "e2e/.auth/state.json";

setup("authenticate", async ({ page }) => {
  await page.goto("/login?next=/workshops");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button:has-text("Sign in")');
  // Land in the authenticated app shell.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
  await expect(page).not.toHaveURL(/\/login/);
  await page.context().storageState({ path: STATE });
});
