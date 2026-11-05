// App shell: header (brand, nav, docs link, party switcher, network status, theme toggle), main,
// footer. The nav scrolls horizontally inside its own strip on narrow screens.
import { CHAIN_NAME } from '@standby/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router';
import { DOCS_URL, EXPECTED_CHAIN_ID } from '../config';
import { formatInt, formatTime } from '../lib/format';
import { PARTIES, ROUTES, isParty } from '../routes';
import { useData } from '../state/data';
import { useSettings } from '../state/settings';
import { Tip } from './Tip';
import { StaleBanner } from './ui';

function usePrefersDark(): boolean {
  const [dark, setDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const on = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return dark;
}

function ThemeToggle() {
  const { theme, setTheme } = useSettings();
  const prefersDark = usePrefersDark();
  const isDark = theme === 'dark' || (theme === 'system' && prefersDark);
  const next = isDark ? 'light' : 'dark';
  return (
    <button
      type="button"
      className="icon-btn"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme (Settings has “follow system”)`}
    >
      {isDark ? (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" strokeWidth="2" />
          <path
            d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

function NetworkChip() {
  const { status } = useData();
  const { effectiveRpcUrl } = useSettings();
  const wrongChain = status.chainId !== null && status.chainId !== EXPECTED_CHAIN_ID;
  const tone = status.state === 'down' ? 'negative' : status.state === 'checking' || wrongChain ? 'warning' : 'positive';
  const text =
    status.state === 'down'
      ? 'RPC unreachable'
      : status.blockNumber === null
        ? 'Connecting…'
        : `#${formatInt(status.blockNumber)}`;
  return (
    <Tip
      tip={
        <>
          <span className="tip-title">Network status</span>
          {status.state === 'down' ? 'RPC unreachable' : status.state === 'ok' ? 'RPC reachable' : 'Checking RPC…'}
          {'\n'}RPC: {effectiveRpcUrl}
          {status.chainId !== null && (
            <>
              {'\n'}Chain ID: {status.chainId}
              {wrongChain ? ` (expected ${EXPECTED_CHAIN_ID}, ${CHAIN_NAME})` : ` (${CHAIN_NAME})`}
            </>
          )}
          {status.blockNumber !== null && <>{'\n'}Latest block: {formatInt(status.blockNumber)} (eth_getBlockByNumber “latest”)</>}
          {status.blockTime !== null && <>{'\n'}Block time: {formatTime(status.blockTime)}</>}
          {status.error && <>{'\n'}Error: {status.error}</>}
          {'\n'}Polled every 3 s.
        </>
      }
      className={`chip chip-${tone}`}
    >
      <span className="dot" aria-hidden="true" />
      <span className="chip-text">{text}</span>
      {status.chainId !== null && <span className="chip-chain">· {status.chainId}</span>}
    </Tip>
  );
}

function PartySwitcher() {
  const { party, setParty, wallets } = useSettings();
  return (
    <label className="party">
      <span className="party-label">Acting as</span>
      <select value={party} onChange={(e) => isParty(e.target.value) && setParty(e.target.value)}>
        {PARTIES.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      {!wallets[party] && (
        <span className="party-warn" title="No key for this wallet; add one in Settings">
          no key
        </span>
      )}
    </label>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const header = ROUTES.filter((r) => r.placement === 'header');
  const footer = ROUTES.filter((r) => r.placement === 'footer');
  const location = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
    const nav = document.querySelector<HTMLElement>('.nav');
    const link = nav?.querySelector<HTMLElement>('a.active');
    if (nav && link) nav.scrollLeft = link.offsetLeft - (nav.clientWidth - link.offsetWidth) / 2;
  }, [location.pathname]);

  return (
    <div className="shell">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="header">
        <div className="header-top">
          <NavLink to="/" className="brand" aria-label="Standby home">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" className="brand-mark">
              <rect x="2" y="2" width="20" height="20" rx="6" fill="currentColor" />
              <path d="M7 15.5h10M7 11.5h10M7 7.5h6" stroke="var(--color-on-accent)" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span>Standby</span>
          </NavLink>
          <nav className="nav" aria-label="Main">
            {header.map((r) => (
              <NavLink key={r.path} to={r.path} end={r.path === '/'}>
                {r.title}
              </NavLink>
            ))}
            <a href={DOCS_URL} target="_blank" rel="noreferrer" className="nav-ext">
              Docs ↗
            </a>
          </nav>
          <div className="header-tools">
            <PartySwitcher />
            <NetworkChip />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="main" id="main">
        <StaleBanner />
        {children}
      </main>

      <footer className="footer">
        <nav aria-label="Footer" className="footer-nav">
          {footer.map((r) => (
            <NavLink key={r.path} to={r.path}>
              {r.title}
            </NavLink>
          ))}
          <a href={DOCS_URL} target="_blank" rel="noreferrer">
            Docs ↗
          </a>
        </nav>
        <span className="muted">Whitechain Sepolia testnet demo. Test tokens have no value.</span>
      </footer>
    </div>
  );
}
