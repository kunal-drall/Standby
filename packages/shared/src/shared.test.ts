import { describe, expect, it } from 'vitest';
import {
  CHAIN_ID,
  DEMO_PARAMS,
  LoanState,
  Role,
  bidBookAbi,
  bidPrice,
  collateralValue,
  contractAddress,
  deployments,
  dueAfter,
  formatBps,
  formatDuration,
  formatNav,
  formatUsdt,
  isDeployed,
  loanStateName,
  neededCapacity,
  parseNav,
  parseShares,
  parseUsdt,
  percentToBps,
  priceLimit,
  sharesForUsdt,
  standbyMarketAbi,
  txUrl,
  whitechainSepolia,
  YEAR_SECONDS,
} from './index.js';

describe('constants', () => {
  it('match the spec', () => {
    expect(CHAIN_ID).toBe(1874);
    expect(whitechainSepolia.id).toBe(1874);
    expect(Role).toEqual({ HOLDER: 1, BUYER: 2, CONTRACT: 4 });
    expect(loanStateName(LoanState.Settled)).toBe('Settled');
    expect(DEMO_PARAMS.maxDiscountBps).toBe(800);
    expect(txUrl('0xabc')).toBe('https://explorer.testnet.whitechain.io/tx/0xabc');
  });

  it('deployments start empty', () => {
    expect(deployments.chainId).toBe(1874);
    expect(isDeployed()).toBe(false);
    expect(() => contractAddress('StandbyMarket')).toThrow(/not deployed/);
  });
});

describe('units', () => {
  it('round-trips USDT for 6 and 18 decimals', () => {
    expect(parseUsdt('12.5', 6)).toBe(12_500_000n);
    expect(formatUsdt(12_500_000n, 6)).toBe('12.5');
    expect(parseUsdt('1', 18)).toBe(10n ** 18n);
    expect(() => parseUsdt('1', -1)).toThrow();
  });

  it('encodes NAV as USDT base units per 1e18 shares', () => {
    expect(parseNav('1.02', 6)).toBe(1_020_000n);
    expect(formatNav(1_020_000n, 6)).toBe('1.02');
  });

  it('formats bps and durations', () => {
    expect(formatBps(850)).toBe('8.5%');
    expect(formatBps(10_000)).toBe('100%');
    expect(percentToBps('3')).toBe(300);
    expect(() => percentToBps('3.001')).toThrow();
    expect(() => percentToBps('101')).toThrow();
    expect(formatDuration(600)).toBe('10 min');
    expect(formatDuration(3725)).toBe('1 h 2 min');
    expect(formatDuration(0)).toBe('0 s');
  });
});

describe('math mirrors interfaces.md section 5', () => {
  const nav = 1_020_000n; // 1.02 USDT, 6 decimals
  const collateral = parseShares('1000');

  it('computes the price limit', () => {
    const value = collateralValue(collateral, nav);
    expect(value).toBe(1_020_000_000n); // 1,020 USDT
    expect(priceLimit(value, DEMO_PARAMS.maxLtvBps)).toBe(867_000_000n); // 85%
  });

  it('accrues simple interest', () => {
    expect(dueAfter(1_000_000_000n, 800, YEAR_SECONDS)).toBe(1_080_000_000n);
    expect(dueAfter(1_000_000_000n, 800, 0n)).toBe(1_000_000_000n);
  });

  it('rounds needed capacity up and shares up', () => {
    expect(neededCapacity(900n, 1000)).toBe(1000n);
    expect(neededCapacity(901n, 1000)).toBe(1002n); // 1001.11 -> 1002
    const price = bidPrice(nav, 300); // 3% discount
    expect(price).toBe(989_400n);
    expect(sharesForUsdt(989_400n, price)).toBe(10n ** 18n);
    expect(sharesForUsdt(1n, price) * price).toBeGreaterThanOrEqual(10n ** 18n);
  });
});

describe('placeholder ABIs', () => {
  it('parse and expose the spec functions', () => {
    const names = (abi: readonly { type: string; name?: string }[]) =>
      abi.filter((x) => x.type === 'function').map((x) => x.name);
    expect(names(bidBookAbi)).toContain('freeCapacity');
    expect(names(standbyMarketAbi)).toEqual(
      expect.arrayContaining(['openLoan', 'repay', 'settle', 'isSettleable', 'previewLimits']),
    );
  });
});
