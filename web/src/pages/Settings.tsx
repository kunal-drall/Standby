import { addressUrl, FAUCET_URL } from '@standby/shared';
import { useState } from 'react';
import { AddressCell, Badge, Card, PageHead } from '../components/ui';
import {
  ADDRESSES,
  CONTRACT_ENV,
  CONTRACT_KEYS,
  CONTRACT_LABEL,
  DEFAULT_RPC_URL,
  DOCS_URL,
  KEEPER_API,
  PARTY_ENV,
  START_BLOCK,
} from '../config';
import { formatInt } from '../lib/format';
import { PARTIES, type Party } from '../routes';
import { useData } from '../state/data';
import { useSettings, type Theme } from '../state/settings';

function RpcCard() {
  const { rpcUrl, effectiveRpcUrl, setRpcUrl } = useSettings();
  const { status } = useData();
  const [text, setText] = useState(rpcUrl ?? '');
  const valid = text.trim() === '' || /^https?:\/\/\S+$/.test(text.trim());
  return (
    <Card title="RPC endpoint">
      <div className="field">
        <label htmlFor="rpc-url">RPC URL</label>
        <input
          id="rpc-url"
          className="input mono"
          value={text}
          placeholder={DEFAULT_RPC_URL}
          onChange={(e) => setText(e.target.value)}
          aria-invalid={!valid || undefined}
          spellCheck={false}
        />
        <span className="hint">
          In use: <span className="mono">{effectiveRpcUrl}</span>{' '}
          {status.state === 'ok' ? <Badge tone="positive">reachable</Badge> : status.state === 'down' ? <Badge tone="negative">unreachable</Badge> : <Badge>checking</Badge>}
          <br />
          Default from the build: <span className="mono">{DEFAULT_RPC_URL}</span>
        </span>
      </div>
      <div className="btn-row">
        <button type="button" className="btn btn-primary" disabled={!valid || text.trim() === ''} onClick={() => setRpcUrl(text.trim())}>
          Save RPC URL
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={rpcUrl === null}
          onClick={() => {
            setRpcUrl(null);
            setText('');
          }}
        >
          Use default
        </button>
      </div>
    </Card>
  );
}

function KeyRow({ party }: { party: Party }) {
  const { wallets, overrides, setKeyOverride, party: activeParty, setParty } = useSettings();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const w = wallets[party];
  return (
    <tr>
      <th scope="row">
        {party} {activeParty === party && <Badge tone="accent">active</Badge>}
      </th>
      <td>{w ? <AddressCell address={w.address} label="" /> : <span className="muted">no key</span>}</td>
      <td>
        {w ? (
          overrides[party] ? (
            <Badge tone="info">pasted here</Badge>
          ) : (
            <Badge>{PARTY_ENV[party]}</Badge>
          )
        ) : (
          <span className="muted small">set {PARTY_ENV[party]}</span>
        )}
      </td>
      <td>
        <form
          className="key-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (setKeyOverride(party, text)) {
              setText('');
              setError(null);
            } else setError('Expected 32 bytes of hex (64 characters, 0x optional).');
          }}
        >
          <label className="sr-only" htmlFor={`key-${party}`}>
            Private key for {party}
          </label>
          <input
            id={`key-${party}`}
            className="input input-sm mono"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="0x… testnet key"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" className="btn btn-secondary btn-sm" disabled={text.trim() === ''}>
            Save key
          </button>
          {overrides[party] && (
            <button type="button" className="btn btn-link btn-sm" onClick={() => setKeyOverride(party, null)}>
              Clear override
            </button>
          )}
          {activeParty !== party && w && (
            <button type="button" className="btn btn-link btn-sm" onClick={() => setParty(party)}>
              Make active
            </button>
          )}
        </form>
        {error && <span className="field-error">{error}</span>}
      </td>
    </tr>
  );
}

export function Settings() {
  const { theme, setTheme, numberFormat, setNumberFormat, party, setParty } = useSettings();
  return (
    <>
      <PageHead title="Settings" lead="Stored in this browser only (localStorage). Nothing is sent to a server." />
      <div className="card-grid">
        <RpcCard />
        <Card title="Appearance and numbers">
          <fieldset className="radio-row">
            <legend>Theme</legend>
            {(['system', 'light', 'dark'] as Theme[]).map((t) => (
              <label key={t} className="check">
                <input type="radio" name="theme" checked={theme === t} onChange={() => setTheme(t)} />
                {t === 'system' ? 'Follow system' : t === 'light' ? 'Light' : 'Dark'}
              </label>
            ))}
          </fieldset>
          <fieldset className="radio-row">
            <legend>Number format</legend>
            <label className="check">
              <input type="radio" name="numfmt" checked={numberFormat === 'full'} onChange={() => setNumberFormat('full')} />
              Full (1,234.567891)
            </label>
            <label className="check">
              <input type="radio" name="numfmt" checked={numberFormat === 'compact'} onChange={() => setNumberFormat('compact')} />
              Compact (1.23K)
            </label>
          </fieldset>
          <div className="field">
            <label htmlFor="settings-party">Active demo wallet</label>
            <select id="settings-party" className="input" value={party} onChange={(e) => setParty(e.target.value as Party)}>
              {PARTIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <span className="hint">Same as “Acting as” in the header.</span>
          </div>
        </Card>
      </div>

      <Card title="Demo wallets">
        <p className="muted small">
          Testnet throwaway keys only. Keys baked in at build time are visible to anyone who loads this app; a key you paste here
          stays in this browser’s localStorage and overrides the build one. Keys are never shown or logged. Each wallet needs WBT for
          gas from the <a href={FAUCET_URL} target="_blank" rel="noreferrer">faucet</a>.
        </p>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Party</th>
                <th scope="col">Address</th>
                <th scope="col">Key source</th>
                <th scope="col">Override</th>
              </tr>
            </thead>
            <tbody>
              {PARTIES.map((p) => (
                <KeyRow key={p} party={p} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Build configuration">
        <div className="table-wrap">
          <table className="table">
            <tbody>
              {CONTRACT_KEYS.map((k) => (
                <tr key={k}>
                  <th scope="row">{CONTRACT_LABEL[k]}</th>
                  <td>
                    {ADDRESSES[k] ? (
                      <a className="mono" href={addressUrl(ADDRESSES[k])} target="_blank" rel="noreferrer">
                        {ADDRESSES[k]}
                      </a>
                    ) : (
                      <Badge tone="warning">not configured</Badge>
                    )}
                  </td>
                  <td className="muted small mono">{CONTRACT_ENV[k]}</td>
                </tr>
              ))}
              <tr>
                <th scope="row">Start block</th>
                <td className="mono">{formatInt(START_BLOCK)}</td>
                <td className="muted small mono">VITE_START_BLOCK</td>
              </tr>
              <tr>
                <th scope="row">Docs</th>
                <td className="mono">
                  <a href={DOCS_URL} target="_blank" rel="noreferrer">
                    {DOCS_URL}
                  </a>
                </td>
                <td className="muted small mono">VITE_DOCS_URL</td>
              </tr>
              <tr>
                <th scope="row">Keeper API</th>
                <td className="mono">{KEEPER_API ?? <span className="muted">not set (the app reads the chain directly)</span>}</td>
                <td className="muted small mono">VITE_KEEPER_API</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
