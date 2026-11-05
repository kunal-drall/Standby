import { Link } from 'react-router';
import { PageHead } from '../components/ui';

export function Privacy() {
  return (
    <article className="prose card">
      <PageHead title="Privacy" lead="Standby is a testnet demo. It has no backend that stores anything about you." />
      <h2>What is stored</h2>
      <ul>
        <li>
          <strong>Nothing server-side.</strong> The app is static files. It talks only to the RPC node you see in the network chip
          (and, if configured, a read-only keeper API), which receive the same public blockchain requests any wallet sends.
        </li>
        <li>
          <strong>localStorage, in this browser only:</strong> your settings (theme, number format, active demo wallet, RPC URL) and any
          testnet private key you paste on the Settings page. Clear them from Settings or by clearing this site’s data.
        </li>
        <li>
          <strong>No analytics,</strong> no cookies, no tracking pixels, no third-party scripts or fonts.
        </li>
      </ul>
      <h2>On-chain data</h2>
      <p>
        Every transaction you send from a demo wallet is public on Whitechain Sepolia and visible on the block explorer, like any
        blockchain transaction. Use throwaway testnet keys only.
      </p>
      <p>
        <Link to="/settings">Open Settings</Link> · <Link to="/terms">Terms</Link>
      </p>
    </article>
  );
}

export function Terms() {
  return (
    <article className="prose card">
      <PageHead title="Terms" lead="A hackathon demo on a test network. Read this before clicking anything." />
      <h2>Testnet only</h2>
      <p>
        Standby runs on Whitechain Sepolia (chain 1874). The fund shares, NAV, bids and loans are demonstrations. The test USDT and
        WBT used here have no monetary value and cannot be redeemed for anything.
      </p>
      <h2>No warranty</h2>
      <p>
        The software is provided as is, without warranty of any kind, under the MIT licence. The contracts have not been audited. Do
        not use real funds, real keys, or keys that have ever held real funds.
      </p>
      <h2>Not an offer</h2>
      <p>Nothing here is an offer of securities, lending services, or investment advice.</p>
      <p>
        <Link to="/privacy">Privacy</Link> · <Link to="/">Overview</Link>
      </p>
    </article>
  );
}

export function NotFound() {
  return (
    <section className="card">
      <PageHead title="Page not found" lead="There is nothing at this address." />
      <Link className="btn btn-primary" to="/">
        Back to the overview
      </Link>
    </section>
  );
}
