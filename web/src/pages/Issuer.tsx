import {
  allowlistRegistryAbi,
  formatDuration,
  navOracleAbi,
  parseNav,
  parseShares,
  restrictedAssetAbi,
  Role,
} from '@standby/shared';
import { useMemo, useState } from 'react';
import { getAddress, isAddress, parseEventLogs, type Address } from 'viem';
import { TxButton, TxPanel, useTx } from '../components/Tx';
import {
  AddressCell,
  Amount,
  Badge,
  Card,
  contractLabel,
  Empty,
  ErrorState,
  Explainer,
  Kpi,
  KpiRow,
  Loading,
  Num,
  PageHead,
  PartyHint,
  useFmt,
  useGate,
} from '../components/ui';
import { CONTRACTS } from '../config';
import { publicClientFor } from '../lib/clients';
import { navFresh } from '../lib/derived';
import { formatInt, formatTime } from '../lib/format';
import { useLogs } from '../lib/logs';
import { useAsync } from '../lib/useAsync';
import { PARTIES } from '../routes';
import { useData, useNow } from '../state/data';
import { useSettings } from '../state/settings';

const ROLE_NAMES = ['HOLDER', 'BUYER', 'CONTRACT'] as const;
type RoleName = (typeof ROLE_NAMES)[number];

export function rolesText(roles: number): string {
  const names = ROLE_NAMES.filter((r) => (roles & Role[r]) !== 0);
  return names.length ? names.join(' + ') : 'none';
}

function RoleBadges({ roles }: { roles: number }) {
  if (roles === 0) return <Badge tone="neutral">not allowlisted</Badge>;
  return (
    <span className="badges">
      {ROLE_NAMES.filter((r) => (roles & Role[r]) !== 0).map((r) => (
        <Badge key={r} tone={r === 'CONTRACT' ? 'info' : r === 'BUYER' ? 'accent' : 'positive'}>
          {r}
        </Badge>
      ))}
    </span>
  );
}

function AddressInput({
  id,
  label,
  value,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: React.ReactNode;
}) {
  const { wallets } = useSettings();
  const invalid = value.trim() !== '' && !isAddress(value.trim(), { strict: false });
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="input mono"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0x…"
        spellCheck={false}
        autoComplete="off"
        list={`${id}-list`}
        aria-invalid={invalid || undefined}
      />
      <datalist id={`${id}-list`}>
        {PARTIES.map((p) => wallets[p] && <option key={p} value={wallets[p].address} label={p} />)}
        {CONTRACTS && <option value={CONTRACTS.market} label="StandbyMarket" />}
        {CONTRACTS && <option value={CONTRACTS.bidBook} label="BidBook" />}
      </datalist>
      {invalid ? <span className="field-error">Not a valid address</span> : hint && <span className="hint">{hint}</span>}
    </div>
  );
}

function PostNavCard() {
  const { snap } = useData();
  const now = useNow();
  const f = useFmt();
  const tx = useTx();
  const [text, setText] = useState('');
  if (!snap || !CONTRACTS) return null;
  const c = CONTRACTS;
  const value = text === '' ? f.nav(snap.nav) : text;
  let parsed: bigint | null = null;
  try {
    parsed = parseNav(value, snap.decimals);
  } catch {
    parsed = null;
  }
  const age = snap.navUpdatedAt ? now - snap.navUpdatedAt : null;
  const fresh = navFresh(snap, now);

  return (
    <Card title="NAV" aside={fresh ? <Badge tone="positive">fresh</Badge> : <Badge tone="warning">stale</Badge>}>
      <dl className="facts">
        <div>
          <dt>Current NAV</dt>
          <dd>
            <Num tip={`NavOracle.latest().nav = ${snap.nav.toString()} base units per 1e18 shares (${snap.decimals}-decimal USDT)`}>
              {f.nav(snap.nav)} {f.sym} / share
            </Num>
          </dd>
        </div>
        <div>
          <dt>Age</dt>
          <dd>
            <Num tip={`now − updatedAt; posted ${snap.navUpdatedAt ? formatTime(snap.navUpdatedAt) : 'never'}`}>
              {age === null ? 'never posted' : formatDuration(age)}
            </Num>{' '}
            <span className="muted">
              of{' '}
              <Num tip="StandbyMarket.params().maxNavAge: older NAV blocks new loans">{formatDuration(snap.params.maxNavAge)}</Num> max
            </span>
          </dd>
        </div>
      </dl>
      <div className="field">
        <label htmlFor="nav-input">New NAV (USDT per share)</label>
        <div className="input-group">
          <input
            id="nav-input"
            className="input"
            inputMode="decimal"
            value={value}
            onChange={(e) => setText(e.target.value)}
            aria-invalid={parsed === null || undefined}
          />
          <span className="input-suffix">{f.sym}</span>
        </div>
        <span className="hint">
          {parsed !== null ? (
            <Num tip={`parseNav("${value}", ${snap.decimals}) = ${value} × 10^${snap.decimals}`}>
              = {parsed.toString()} base units per 1e18 shares
            </Num>
          ) : (
            'Enter a decimal number, e.g. 1.02'
          )}
        </span>
      </div>
      <TxButton
        size="block"
        pending={tx.pending}
        disabled={tx.busy || parsed === null}
        onClick={() =>
          parsed !== null &&
          void tx.run('Post NAV', async (send) => {
            await send.write({ label: 'Post NAV', address: c.oracle, abi: navOracleAbi, functionName: 'setNav', args: [parsed] });
            return `NAV is now ${value} ${f.sym} per share.`;
          })
        }
      >
        Post NAV
      </TxButton>
      <TxPanel state={tx.state} />
    </Card>
  );
}

function PauseCard() {
  const { snap } = useData();
  const tx = useTx();
  if (!snap || !CONTRACTS) return null;
  const c = CONTRACTS;
  const paused = snap.paused;
  return (
    <Card title="Transfers" aside={paused ? <Badge tone="warning">paused</Badge> : <Badge tone="positive">active</Badge>}>
      <p className="muted small">
        RestrictedAsset.paused() is <strong>{paused ? 'true' : 'false'}</strong>. While paused no share moves at all: no transfers or
        mints, no new loans, and repayments and settlements wait too, because both move shares.
      </p>
      {paused ? (
        <TxButton
          size="block"
          pending={tx.pending}
          disabled={tx.busy}
          onClick={() =>
            void tx.run('Unpause', async (send) => {
              await send.write({ label: 'Unpause', address: c.asset, abi: restrictedAssetAbi, functionName: 'unpause' });
              return 'Shares can move again.';
            })
          }
        >
          Unpause
        </TxButton>
      ) : (
        <TxButton
          size="block"
          variant="danger"
          pending={tx.pending}
          disabled={tx.busy}
          onClick={() =>
            void tx.run('Pause', async (send) => {
              await send.write({ label: 'Pause', address: c.asset, abi: restrictedAssetAbi, functionName: 'pause' });
              return 'All share movements are blocked until you unpause.';
            })
          }
        >
          Pause
        </TxButton>
      )}
      <TxPanel state={tx.state} />
    </Card>
  );
}

function useRolesOf(address: string, block: bigint | undefined) {
  const { effectiveRpcUrl } = useSettings();
  const valid = isAddress(address.trim(), { strict: false });
  return useAsync(
    valid && CONTRACTS
      ? () =>
          publicClientFor(effectiveRpcUrl).readContract({
            address: (CONTRACTS as NonNullable<typeof CONTRACTS>).registry,
            abi: allowlistRegistryAbi,
            functionName: 'roles',
            args: [getAddress(address.trim())],
          })
      : null,
    `${effectiveRpcUrl}|${address.trim().toLowerCase()}|${block ?? ''}`,
  );
}

type RolesForm = { address: string; checks: Record<RoleName, boolean> };

function SetRolesCard({ form, setForm }: { form: RolesForm; setForm: (f: RolesForm) => void }) {
  const { snap } = useData();
  const tx = useTx();
  const current = useRolesOf(form.address, snap?.blockNumber);
  if (!snap || !CONTRACTS) return null;
  const c = CONTRACTS;
  const mask = ROLE_NAMES.reduce((m, r) => (form.checks[r] ? m | Role[r] : m), 0);
  const valid = isAddress(form.address.trim(), { strict: false });
  const parts = ROLE_NAMES.filter((r) => form.checks[r]).map((r) => `${r} ${Role[r]}`);

  return (
    <Card title="Allowlist roles" id="set-roles">
      <AddressInput
        id="roles-address"
        label="Account address"
        value={form.address}
        onChange={(address) => setForm({ ...form, address })}
        hint={
          valid && current.data !== undefined ? (
            <>
              Current roles: <RoleBadges roles={Number(current.data)} />
            </>
          ) : (
            'Pick a demo wallet from the suggestions or paste any address.'
          )
        }
      />
      <fieldset className="checks-row">
        <legend>Roles</legend>
        {ROLE_NAMES.map((r) => (
          <label key={r} className="check">
            <input
              type="checkbox"
              checked={form.checks[r]}
              onChange={(e) => setForm({ ...form, checks: { ...form.checks, [r]: e.target.checked } })}
            />
            {r}
          </label>
        ))}
      </fieldset>
      <p className="hint">
        <Num tip={`roles bitmask = ${parts.length ? parts.map((p) => p.split(' ')[1]).join(' + ') : '0'}; HOLDER 1, BUYER 2, CONTRACT 4. Replaces the account's roles; 0 removes it from the allowlist.`}>
          roles = {mask}
        </Num>{' '}
        {mask === 0 && <span className="muted">(removes the account from the allowlist)</span>}
      </p>
      <TxButton
        size="block"
        pending={tx.pending}
        disabled={tx.busy || !valid}
        onClick={() => {
          const account = getAddress(form.address.trim());
          void tx.run('Set roles', async (send) => {
            await send.write({ label: 'Set roles', address: c.registry, abi: allowlistRegistryAbi, functionName: 'setRoles', args: [account, mask] });
            return `Roles of ${account.slice(0, 10)}… are now ${rolesText(mask)}.`;
          });
        }}
      >
        Set roles
      </TxButton>
      <TxPanel state={tx.state} />
    </Card>
  );
}

function MintCard() {
  const { snap } = useData();
  const { wallets } = useSettings();
  const f = useFmt();
  const tx = useTx();
  const [to, setTo] = useState<string | null>(null);
  const [amount, setAmount] = useState('1000');
  const target = to ?? wallets.Borrower?.address ?? '';
  const roles = useRolesOf(target, snap?.blockNumber);
  if (!snap || !CONTRACTS) return null;
  const c = CONTRACTS;
  let shares: bigint | null = null;
  try {
    shares = parseShares(amount);
  } catch {
    shares = null;
  }
  const valid = isAddress(target.trim(), { strict: false });
  const holder = roles.data !== undefined && (Number(roles.data) & Role.HOLDER) !== 0;

  return (
    <Card title="Mint shares">
      <AddressInput
        id="mint-to"
        label="Mint to address"
        value={target}
        onChange={setTo}
        hint={
          valid && roles.data !== undefined ? (
            holder ? (
              <>Has the HOLDER role.</>
            ) : (
              <span className="text-warning">No HOLDER role: the mint will be rejected.</span>
            )
          ) : undefined
        }
      />
      <div className="field">
        <label htmlFor="mint-amount">Shares to mint</label>
        <div className="input-group">
          <input id="mint-amount" className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <span className="input-suffix">{snap.assetSymbol}</span>
        </div>
        <span className="hint">
          Supply now: <Amount kind="shares" value={snap.assetSupply} tip="RestrictedAsset.totalSupply()" />
        </span>
      </div>
      <TxButton
        size="block"
        pending={tx.pending}
        disabled={tx.busy || !valid || shares === null || shares === 0n}
        onClick={() => {
          if (shares === null) return;
          const account = getAddress(target.trim());
          void tx.run('Mint', async (send) => {
            await send.write({ label: 'Mint', address: c.asset, abi: restrictedAssetAbi, functionName: 'mint', args: [account, shares] });
            return `Minted ${f.s(shares)} shares.`;
          });
        }}
      >
        Mint
      </TxButton>
      <TxPanel state={tx.state} />
    </Card>
  );
}

const DEAD = '0x000000000000000000000000000000000000dEaD';

function TryTransferCard() {
  const { snap } = useData();
  const { active, party } = useSettings();
  const tx = useTx();
  const [to, setTo] = useState(DEAD);
  const roles = useRolesOf(to, snap?.blockNumber);
  if (!snap || !CONTRACTS) return null;
  const c = CONTRACTS;
  const valid = isAddress(to.trim(), { strict: false });
  const one = 10n ** 18n;
  return (
    <Card title="Test a transfer">
      <p className="muted small">
        Tries to send 1 share from the active wallet ({party}) to an address. Shares only move between allowlisted wallets, so a
        transfer to an address that is not on the allowlist is rejected by the token itself.
      </p>
      <AddressInput
        id="transfer-to"
        label="Transfer to address"
        value={to}
        onChange={setTo}
        hint={
          valid && roles.data !== undefined ? (
            Number(roles.data) === 0 ? (
              <>Not on the allowlist.</>
            ) : (
              <>
                On the allowlist: <RoleBadges roles={Number(roles.data)} />
              </>
            )
          ) : undefined
        }
      />
      {snap.party && (
        <p className="hint">
          {party} holds <Amount kind="shares" value={snap.party.shares} tip="RestrictedAsset.balanceOf(active wallet)" /> and has roles{' '}
          <RoleBadges roles={snap.party.roles} />
        </p>
      )}
      <TxButton
        size="block"
        variant="secondary"
        pending={tx.pending}
        disabled={tx.busy || !valid || !active}
        onClick={() => {
          const account = getAddress(to.trim());
          void tx.run('Try transfer', async (send) => {
            const receipt = await send.write({
              label: 'Transfer 1 share',
              address: c.asset,
              abi: restrictedAssetAbi,
              functionName: 'transfer',
              args: [account, one],
            });
            const moved = parseEventLogs({ abi: restrictedAssetAbi, logs: receipt.logs, eventName: 'Transfer' }).length > 0;
            return moved ? 'The transfer went through: both wallets are allowlisted.' : 'The transfer went through.';
          });
        }}
      >
        Try transfer
      </TxButton>
      <TxPanel state={tx.state} />
    </Card>
  );
}

function AllowlistTable({ onEdit }: { onEdit: (address: Address, roles: number) => void }) {
  const { effectiveRpcUrl, wallets, labelOf } = useSettings();
  const { snap } = useData();
  const logs = useLogs(effectiveRpcUrl);

  const entries = useMemo(() => {
    const map = new Map<string, { address: Address; lastBlock: bigint | null; changes: number }>();
    const add = (address: Address, block: bigint | null) => {
      const key = address.toLowerCase();
      const prev = map.get(key);
      if (!prev) map.set(key, { address, lastBlock: block, changes: block === null ? 0 : 1 });
      else if (block !== null) map.set(key, { ...prev, lastBlock: block, changes: prev.changes + 1 });
    };
    for (const l of logs.logs) {
      if (l.contract === 'registry' && l.eventName === 'RolesSet') add(l.args.account as Address, l.blockNumber);
    }
    for (const p of PARTIES) if (wallets[p]) add(wallets[p].address, null);
    if (CONTRACTS) {
      add(CONTRACTS.market, null);
      add(CONTRACTS.bidBook, null);
    }
    return [...map.values()];
  }, [logs.logs, wallets]);

  const key = `${effectiveRpcUrl}|${entries.map((e) => e.address).join(',')}|${snap?.blockNumber ?? ''}`;
  const roles = useAsync(
    CONTRACTS
      ? async () => {
          const pub = publicClientFor(effectiveRpcUrl);
          const registry = (CONTRACTS as NonNullable<typeof CONTRACTS>).registry;
          const values = await Promise.all(
            entries.map((e) => pub.readContract({ address: registry, abi: allowlistRegistryAbi, functionName: 'roles', args: [e.address] })),
          );
          return new Map(entries.map((e, i) => [e.address.toLowerCase(), Number(values[i])]));
        }
      : null,
    key,
  );

  return (
    <Card
      title="Known accounts"
      aside={
        <span className="muted small">
          RolesSet events{logs.scannedTo !== null ? ` to block ${formatInt(logs.scannedTo)}` : ''} + demo wallets
        </span>
      }
    >
      {logs.error && <ErrorState title="Could not scan RolesSet events" message={logs.error} onRetry={() => void logs.rescan()} />}
      {roles.data === undefined && !roles.error ? (
        <Loading />
      ) : roles.error && roles.data === undefined ? (
        <ErrorState message={roles.error} />
      ) : entries.length === 0 ? (
        <Empty title="No accounts yet" />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Account</th>
                <th scope="col">Current roles</th>
                <th scope="col" className="num-col">
                  Last change
                </th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const r = roles.data?.get(e.address.toLowerCase()) ?? 0;
                const label = contractLabel(e.address) ?? labelOf(e.address);
                return (
                  <tr key={e.address}>
                    <td>
                      <AddressCell address={e.address} label={label} />
                    </td>
                    <td>
                      <Num tip={`AllowlistRegistry.roles(account) = ${r} (${rolesText(r)})`} className="num-plain">
                        <RoleBadges roles={r} />
                      </Num>
                    </td>
                    <td className="num-col">
                      {e.lastBlock === null ? (
                        <span className="muted">—</span>
                      ) : (
                        <Num tip={`Block of the latest RolesSet event for this account (${e.changes} change${e.changes === 1 ? '' : 's'})`}>
                          #{formatInt(e.lastBlock)}
                        </Num>
                      )}
                    </td>
                    <td className="actions-col">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => onEdit(e.address, r)}
                        aria-label={`Edit roles of ${label ?? e.address}`}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export function Issuer() {
  const { snap } = useData();
  const now = useNow();
  const f = useFmt();
  const { gate } = useGate();
  const [form, setForm] = useState<RolesForm>({ address: '', checks: { HOLDER: false, BUYER: false, CONTRACT: false } });

  const edit = (address: Address, roles: number) => {
    setForm({
      address,
      checks: { HOLDER: (roles & Role.HOLDER) !== 0, BUYER: (roles & Role.BUYER) !== 0, CONTRACT: (roles & Role.CONTRACT) !== 0 },
    });
    document.getElementById('roles-address')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <>
      <PageHead
        title="Issuer"
        lead="The issuer runs the allowlist, posts the fund's NAV and can pause the share. Everything here is an issuer-only call."
      />
      <PartyHint expected={['Issuer']} action="Only the issuer wallet can post NAV, pause, mint and set roles; other wallets are rejected (try it)." />
      {gate ?? (
        snap && (
          <>
            <KpiRow>
              <Kpi label="NAV" tone="accent">
                <Num tip={`NavOracle.latest().nav = ${snap.nav.toString()} base units per 1e18 shares`}>
                  {f.nav(snap.nav)} <span className="unit">{f.sym}</span>
                </Num>
              </Kpi>
              <Kpi label="NAV age" tone={navFresh(snap, now) ? undefined : 'warning'}>
                <Num tip={`now − updatedAt; loans need ≤ ${formatDuration(snap.params.maxNavAge)}`}>
                  {snap.navUpdatedAt ? formatDuration(now - snap.navUpdatedAt) : 'never'}
                </Num>
              </Kpi>
              <Kpi label="Asset" tone={snap.paused ? 'warning' : 'positive'}>
                <Num tip="RestrictedAsset.paused()">{snap.paused ? 'Paused' : 'Active'}</Num>
              </Kpi>
              <Kpi label="Share supply">
                <Amount kind="shares" value={snap.assetSupply} tip="RestrictedAsset.totalSupply(): all shares minted" />
              </Kpi>
              <Kpi label="Issuer">
                <AddressCell address={snap.issuer} />
              </Kpi>
            </KpiRow>
            <Explainer
              doing={[
                'Allowlist wallets: HOLDER may hold shares, BUYER may post bids, CONTRACT is for the market and bid book.',
                'Post the NAV in USDT per share. Loans use it for the price limit and settlement prices.',
                'Mint shares to holders, and pause all share movement in an emergency.',
              ]}
              risks={[
                'A NAV older than the maximum age blocks every new loan until a fresh one is posted.',
                'Pausing also blocks repayments and settlements, since both move shares.',
                'Removing a buyer from the allowlist takes its free bids out of capacity; its reserved USDT still fills at settlement, and its shares wait in the market as a claim.',
              ]}
            />
            <div className="card-grid">
              <PostNavCard />
              <PauseCard />
              <SetRolesCard form={form} setForm={setForm} />
              <MintCard />
              <TryTransferCard />
            </div>
            <AllowlistTable onEdit={edit} />
          </>
        )
      )}
    </>
  );
}
