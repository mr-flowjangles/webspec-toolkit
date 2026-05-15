import { test } from '@playwright/test';

test('Create Lead — UCM NexGen', async ({ page }) => {
  // Create a new Medicare lead from the My Work tasks page, sourced from a complainant, classified as beneficiary fraud.
  await page.goto('http://app.ucm-dev.cmscloud.local/ucmnexgen/trackers/my-work/tasks');

  await page.locator('text="add"').click();
  await page.locator('div >> nth=370').click();
  await page.locator('div#mat-select-value-4.mat-mdc-select-value').click();
  await page.locator('text="Medicare"').click();
  await page.locator('role=button[name="Select Lead Source Required"]').click();
  await page.locator('text="Complainant"').click();
  await page.locator('role=textbox[name="Lead Received Date"]').click();
  await page.locator('span >> nth=55').click();
  await page.locator('text="7"').click();
  await page.locator('div#mat-select-value-5.mat-mdc-select-value').click();
  await page.locator('text="Beneficiary Fraud"').click();
  await page.locator('div >> nth=436').click();
  await page.locator('role=radio[name="No"]').check();
  await page.locator('span >> nth=74').click();
  await page.locator('div#mat-select-value-8.mat-mdc-select-value').click();
  await page.locator('text="Supervisor"').click();
  await page.locator('text="Create Lead"').click();

  await page.waitForURL(/\/record\/cse\/CSE-\d+-\d+\//);
});
