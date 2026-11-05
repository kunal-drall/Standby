// Routes from docs/interfaces.md section 7.

export type RouteDef = {
  path: string;
  title: string;
  summary: string;
  placement: 'header' | 'footer';
};

export const ROUTES: RouteDef[] = [
  { path: '/', title: 'Overview', summary: 'What Standby does, with live pool and capacity stats.', placement: 'header' },
  { path: '/issuer', title: 'Issuer', summary: 'Manage the allowlist, post NAV, pause transfers.', placement: 'header' },
  { path: '/lender', title: 'Lender', summary: 'Deposit USDT into the pool and withdraw idle cash.', placement: 'header' },
  { path: '/buyer', title: 'Buyer', summary: 'Lock USDT in a bid, see what is reserved, exit after notice.', placement: 'header' },
  { path: '/borrower', title: 'Borrower', summary: 'Pledge shares, borrow at the lower of the two limits, repay.', placement: 'header' },
  { path: '/capacity', title: 'Capacity', summary: 'Committed, reserved, free and unlocking bid USDT.', placement: 'header' },
  { path: '/activity', title: 'Activity', summary: 'Every contract event with its explorer link.', placement: 'header' },
  { path: '/settings', title: 'Settings', summary: 'RPC URL, demo wallets, theme, number format.', placement: 'footer' },
  { path: '/privacy', title: 'Privacy', summary: 'Testnet demo; nothing stored server-side.', placement: 'footer' },
  { path: '/terms', title: 'Terms', summary: 'Testnet only; tokens have no real value.', placement: 'footer' },
];

export const PARTIES = ['Issuer', 'Lender', 'Buyer 1', 'Buyer 2', 'Borrower'] as const;
export type Party = (typeof PARTIES)[number];

/** The page each party mostly works on. */
export const PARTY_PAGE: Record<Party, string> = {
  Issuer: '/issuer',
  Lender: '/lender',
  'Buyer 1': '/buyer',
  'Buyer 2': '/buyer',
  Borrower: '/borrower',
};

export function isParty(value: unknown): value is Party {
  return typeof value === 'string' && (PARTIES as readonly string[]).includes(value);
}
