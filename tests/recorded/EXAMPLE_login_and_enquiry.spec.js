// Example of a recorded test (made with RECORD-NEW-SCRIPT.bat, then tidied a little).
// It logs in, opens the Enquiry tab of the inbox, searches a reference and checks the row is there.
// Run it with RUN-RECORDED-SCRIPT.bat and the name EXAMPLE_login_and_enquiry.
const { test, expect } = require('@playwright/test');
const { row, settings } = require('../../framework/data');

test('EXAMPLE login and enquiry', async ({ page }) => {
  const data = await row('IPLC-01');              // values from data\testdata.xlsx (optional)
  const ref = process.env.REF || 'ENBDLC26007798';

  await page.goto(settings.url);                  // URL from settings.json
  await page.locator('input[name="C_BUSINESS_UNIT"]').fill(settings.businessUnit);
  await page.locator('input[name="C_USER_ID"]').fill(settings.users.maker);
  await page.locator('input[name="C_PASSWORD"]').fill(process.env.EXIM_PASS);
  await page.locator('input[name="C_PASSWORD"]').press('Enter');

  // The inbox is inside a frame called "eeinbox"
  const inbox = page.frameLocator('iframe[name="eeinbox"]');
  await inbox.getByText('Enquiry', { exact: true }).first().click();
  await inbox.getByPlaceholder('Search Reference, CE Ref, Customer...').fill(ref);
  await inbox.getByPlaceholder('Search Reference, CE Ref, Customer...').press('Enter');

  await expect(inbox.locator('table tbody tr').filter({ hasText: ref })).toBeVisible();
  console.log(`Customer in test data row IPLC-01: ${data.customer}`);
});
