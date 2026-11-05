// Both lifecycles end to end through the browser, asserting on page text and on chain state:
// issuer posts NAV; a transfer off the allowlist fails; buyers bid; lender deposits; borrower opens
// at the lower limit and repays (loan 1); borrower opens loan 2; an early buyer withdrawal fails;
// loan 2 passes maturity plus grace and the keeper settles it. Needs the keeper running.
import { expect, test, type Page } from '@playwright/test';
import {
  advanceTime,
  bidCount,
  getLoan,
  latestNav,
  loanCount,
  marketCash,
  party,
  previewLimits,
  shareBalance,
  sharesOf,
  waitFor,
} from './chain';

test.describe.configure({ mode: 'serial' });

const SHARE = 10n ** 18n;
const PLEDGE = 500n;
const OUTSIDER = '0x000000000000000000000000000000000000dEaD';
let repaidLoan: bigint;
let defaultLoan: bigint;

async function actAs(page: Page, who: 'Issuer' | 'Lender' | 'Buyer 1' | 'Buyer 2' | 'Borrower') {
  await page.getByLabel('Acting as').selectOption(who);
}

/** Waits for the newest result panel: "Confirmed" with an explorer link, or a decoded error. */
async function expectConfirmed(page: Page) {
  await expect(page.getByText('Confirmed').last()).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole('link', { name: /^View on explorer/ }).last()).toBeVisible();
}

async function open(page: Page, path: string, who: Parameters<typeof actAs>[1]) {
  await page.goto(path);
  await actAs(page, who);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

test('issuer posts NAV', async ({ page }) => {
  await open(page, '/issuer', 'Issuer');
  await page.getByLabel('New NAV (USDT per share)').fill('1.02');
  await page.getByRole('button', { name: 'Post NAV', exact: true }).click();
  await expectConfirmed(page);
  const [nav] = await latestNav();
  expect(nav).toBe(1_020_000n);
});

test('a transfer to a wallet off the allowlist fails', async ({ page }) => {
  await open(page, '/issuer', 'Borrower');
  await page.getByLabel('Transfer to address').fill(OUTSIDER);
  await page.getByRole('button', { name: 'Try transfer', exact: true }).click();
  await expect(page.getByText('NotAllowed').last()).toBeVisible({ timeout: 60_000 });
  expect(await shareBalance(OUTSIDER)).toBe(0n);
});

test('buyers post bids', async ({ page }) => {
  for (const [who, discount] of [
    ['Buyer 1', '3'],
    ['Buyer 2', '5'],
  ] as const) {
    const before = await bidCount();
    await open(page, '/buyer', who);
    await page.getByLabel('Bid amount').fill('50');
    await page.getByLabel('Discount (%)').fill(discount);
    await page.getByLabel('Notice (seconds)').fill('600');
    await page.getByRole('button', { name: 'Post bid', exact: true }).click();
    await expectConfirmed(page);
    expect(await bidCount()).toBe(before + 1n);
  }
});

test('lender deposits', async ({ page }) => {
  const before = await sharesOf(party.lender);
  await open(page, '/lender', 'Lender');
  await page.getByLabel('Deposit amount').fill('100');
  await page.getByRole('button', { name: 'Deposit', exact: true }).click();
  await expectConfirmed(page);
  expect(await sharesOf(party.lender)).toBeGreaterThan(before);
});

async function openLoanAtMax(page: Page): Promise<bigint> {
  const before = await loanCount();
  const shares = await shareBalance(party.borrower);
  await open(page, '/borrower', 'Borrower');
  await page.getByLabel('Shares to pledge').fill(PLEDGE.toString());
  await page.getByRole('button', { name: 'Borrow the maximum' }).click();
  await page.getByRole('button', { name: 'Open loan', exact: true }).click();
  await expectConfirmed(page);
  expect(await loanCount()).toBe(before + 1n);
  const [loan] = await getLoan(before);
  const [priceLimit, capacityLimit] = await previewLimits(PLEDGE * SHARE);
  expect(loan.collateral).toBe(PLEDGE * SHARE);
  expect(loan.principal).toBe(priceLimit < capacityLimit ? priceLimit : loan.principal); // the lower limit
  expect(loan.principal).toBeLessThanOrEqual(priceLimit);
  expect(await shareBalance(party.borrower)).toBe(shares - PLEDGE * SHARE);
  return before;
}

test('borrower opens a loan at the lower limit and repays it in one transaction', async ({ page }) => {
  repaidLoan = await openLoanAtMax(page);
  const shares = await shareBalance(party.borrower);
  await page.reload();
  await actAs(page, 'Borrower');
  await page.getByRole('button', { name: 'Repay', exact: true }).first().click();
  await expectConfirmed(page);
  const [loan] = await getLoan(repaidLoan);
  expect(loan.state).toBe(2); // Repaid
  expect(await shareBalance(party.borrower)).toBe(shares + PLEDGE * SHARE);
});

test('borrower opens a second loan', async ({ page }) => {
  defaultLoan = await openLoanAtMax(page);
});

test('an early buyer withdrawal fails', async ({ page }) => {
  await open(page, '/buyer', 'Buyer 2');
  await page.getByRole('button', { name: 'Request exit', exact: true }).first().click();
  await expectConfirmed(page);
  await page.getByRole('button', { name: 'Withdraw', exact: true }).first().click();
  await expect(page.getByText('NoticeNotOver').last()).toBeVisible({ timeout: 60_000 });
});

test('the keeper settles the second loan after maturity plus grace', async ({ page }) => {
  const cash = await marketCash();
  const b1 = await shareBalance(party.buyer1);
  const b2 = await shareBalance(party.buyer2);
  await advanceTime(900 + 120 + 5);
  await waitFor(async () => (await getLoan(defaultLoan))[0].state === 3, 120_000);

  expect(await marketCash()).toBeGreaterThan(cash); // buyers' USDT repaid the pool
  const delivered = (await shareBalance(party.buyer1)) - b1 + ((await shareBalance(party.buyer2)) - b2);
  expect(delivered).toBeGreaterThan(0n);
  expect(delivered).toBeLessThanOrEqual(PLEDGE * SHARE);

  await page.goto('/activity');
  await expect(page.getByText(/LoanSettled|settled/i).first()).toBeVisible({ timeout: 60_000 });
});
