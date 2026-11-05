import { CHAIN_ID, CHAIN_NAME, isDeployed } from '@standby/shared';
import { useState } from 'react';
import { NavLink, Route, Routes } from 'react-router';
import { Placeholder } from './pages/Placeholder';
import { DOCS_URL, PARTIES, ROUTES, type Party } from './routes';

export function App() {
  const [party, setParty] = useState<Party>('Issuer');
  const header = ROUTES.filter((r) => r.placement === 'header');
  const footer = ROUTES.filter((r) => r.placement === 'footer');

  return (
    <div className="shell">
      <header className="header">
        <NavLink to="/" className="brand">
          Standby
        </NavLink>
        <nav className="nav" aria-label="Main">
          {header.slice(1).map((r) => (
            <NavLink key={r.path} to={r.path}>
              {r.title}
            </NavLink>
          ))}
          <a href={DOCS_URL} target="_blank" rel="noreferrer">
            Docs
          </a>
        </nav>
        <div className="status">
          <label>
            <span className="sr-only">Acting as</span>
            <select value={party} onChange={(e) => setParty(e.target.value as Party)}>
              {PARTIES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <span className="chip" title={`Chain ID ${CHAIN_ID}`}>
            {CHAIN_NAME}
            {isDeployed() ? '' : ' · not deployed'}
          </span>
        </div>
      </header>

      <main className="main">
        <Routes>
          {ROUTES.map((r) => (
            <Route key={r.path} path={r.path} element={<Placeholder route={r} />} />
          ))}
          <Route
            path="*"
            element={
              <Placeholder
                route={{ path: '*', title: 'Not found', summary: 'No page here.', chunk: 'C7', placement: 'footer' }}
              />
            }
          />
        </Routes>
      </main>

      <footer className="footer">
        {footer.map((r) => (
          <NavLink key={r.path} to={r.path}>
            {r.title}
          </NavLink>
        ))}
        <span>Testnet demo. No real value.</span>
      </footer>
    </div>
  );
}
