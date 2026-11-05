// Routes from docs/interfaces.md section 7. Pages are placeholders until C7 (shell, overview,
// settings, privacy, terms, activity) and C8 (party pages, capacity).

export type RouteDef = {
  path: string;
  title: string;
  summary: string;
  chunk: 'C7' | 'C8';
  placement: 'header' | 'footer';
};

export const ROUTES: RouteDef[] = [
  { path: '/', title: 'Overview', summary: 'What Standby does, with live pool and capacity stats.', chunk: 'C7', placement: 'header' },
  { path: '/issuer', title: 'Issuer', summary: 'Manage the allowlist, post NAV, pause transfers.', chunk: 'C8', placement: 'header' },
  { path: '/lender', title: 'Lender', summary: 'Deposit USDT into the pool and withdraw idle cash.', chunk: 'C8', placement: 'header' },
  { path: '/buyer', title: 'Buyer', summary: 'Lock USDT in a bid, see what is reserved, exit after notice.', chunk: 'C8', placement: 'header' },
  { path: '/borrower', title: 'Borrower', summary: 'Pledge shares, borrow at the lower of the two limits, repay.', chunk: 'C8', placement: 'header' },
  { path: '/capacity', title: 'Capacity', summary: 'Committed, reserved, free and unlocking bid USDT.', chunk: 'C8', placement: 'header' },
  { path: '/activity', title: 'Activity', summary: 'Every contract event with its explorer link.', chunk: 'C7', placement: 'header' },
  { path: '/settings', title: 'Settings', summary: 'RPC URL, active demo wallet, theme, number format.', chunk: 'C7', placement: 'footer' },
  { path: '/privacy', title: 'Privacy', summary: 'Testnet demo; nothing stored server-side.', chunk: 'C7', placement: 'footer' },
  { path: '/terms', title: 'Terms', summary: 'Testnet only; tokens have no real value.', chunk: 'C7', placement: 'footer' },
];

export const PARTIES = ['Issuer', 'Lender', 'Buyer 1', 'Buyer 2', 'Borrower'] as const;
export type Party = (typeof PARTIES)[number];

export const DOCS_URL =
  import.meta.env.VITE_DOCS_URL ?? 'https://github.com/kunal-drall/Standby/tree/main/docs';
