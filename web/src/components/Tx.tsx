// Write flow: button -> pending (each step listed) -> success panel with the explorer link, or an
// error panel with the decoded custom error. Every call is simulated first, so a revert is shown
// without sending anything. Only one result panel is visible at a time across the app.
import { txUrl, usdtAbi } from '@standby/shared';
import {
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { encodeFunctionData, type Abi, type Address, type Hash, type TransactionReceipt } from 'viem';
import { publicClientFor, walletClientFor } from '../lib/clients';
import { decodeError, ERROR_ABI, NamedError, type DecodedError } from '../lib/errors';
import { useData } from '../state/data';
import { useSettings } from '../state/settings';

/** approve without a declared return value, so tokens that return nothing still simulate cleanly. */
const APPROVE_ABI = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
] as const satisfies Abi;

type Step = { label: string; hash?: Hash; status: 'waiting' | 'signing' | 'mining' | 'done' | 'failed'; approval: boolean };

type TxState =
  | { phase: 'idle' }
  | { phase: 'pending'; title: string; steps: Step[] }
  | { phase: 'success'; title: string; steps: Step[]; summary: ReactNode }
  | { phase: 'error'; title: string; steps: Step[]; error: DecodedError };

export type WriteCall = {
  label: string;
  address: Address;
  abi: Abi | readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
  approval?: boolean;
};

export type Sender = {
  account: Address;
  /** Simulates, sends, waits for the receipt; throws a decodable error on revert. */
  write: (call: WriteCall) => Promise<TransactionReceipt>;
  /** Approves `spender` for at least `amount` of `token`, skipping it when the allowance suffices. */
  ensureAllowance: (p: { token: Address; spender: Address; amount: bigint; label: string }) => Promise<void>;
};

type Scope = { activeId: string | null; busy: boolean; claim: (id: string) => void; setBusy: (b: boolean) => void };
const TxScope = createContext<Scope | null>(null);

export function TxScopeProvider({ children }: { children: ReactNode }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const value = useMemo<Scope>(() => ({ activeId, busy, claim: setActiveId, setBusy }), [activeId, busy]);
  return <TxScope.Provider value={value}>{children}</TxScope.Provider>;
}

export function useTx() {
  const scope = useContext(TxScope);
  if (!scope) throw new Error('useTx outside TxScopeProvider');
  const { claim, setBusy } = scope;
  const { active, effectiveRpcUrl } = useSettings();
  const { refresh } = useData();
  const id = useId();
  const [state, setState] = useState<TxState>({ phase: 'idle' });

  const run = useCallback(
    async (title: string, fn: (send: Sender) => Promise<ReactNode | void>) => {
      claim(id);
      const steps: Step[] = [];
      const publish = (phase: 'pending') => setState({ phase, title, steps: steps.map((s) => ({ ...s })) });
      if (!active) {
        setState({ phase: 'error', title, steps: [], error: decodeError(new NamedError('NoKey')) });
        return;
      }
      setBusy(true);
      publish('pending');
      const pub = publicClientFor(effectiveRpcUrl);
      const key = active.key;

      const write = async (call: WriteCall): Promise<TransactionReceipt> => {
        const step: Step = { label: call.label, status: 'signing', approval: call.approval ?? false };
        steps.push(step);
        publish('pending');
        const wallet = await walletClientFor(key, effectiveRpcUrl);
        const abi = [...(call.abi as Abi), ...ERROR_ABI] as Abi;
        const args = call.args ?? [];
        try {
          await pub.simulateContract({
            account: wallet.account,
            address: call.address,
            abi,
            functionName: call.functionName,
            args,
          });
          const hash = await wallet.writeContract({
            account: wallet.account,
            chain: wallet.chain,
            address: call.address,
            abi,
            functionName: call.functionName,
            args,
          });
          step.hash = hash;
          step.status = 'mining';
          publish('pending');
          const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 180_000 });
          if (receipt.status !== 'success') {
            // Replay at the same block to recover the revert reason.
            await pub.call({
              account: wallet.account,
              to: call.address,
              data: encodeFunctionData({ abi, functionName: call.functionName, args }),
              blockNumber: receipt.blockNumber,
            });
            throw new NamedError('TransactionReverted');
          }
          step.status = 'done';
          publish('pending');
          return receipt;
        } catch (e) {
          step.status = 'failed';
          throw e;
        }
      };

      const ensureAllowance: Sender['ensureAllowance'] = async ({ token, spender, amount, label }) => {
        const current = await pub.readContract({
          address: token,
          abi: usdtAbi,
          functionName: 'allowance',
          args: [active.address, spender],
        });
        if (current >= amount) return;
        if (current > 0n) {
          // Some USDT implementations refuse to change one non-zero allowance to another.
          const direct = await pub
            .simulateContract({ account: active.address, address: token, abi: APPROVE_ABI, functionName: 'approve', args: [spender, amount] })
            .then(() => true)
            .catch(() => false);
          if (!direct) {
            await write({ label: 'Reset approval to 0', address: token, abi: APPROVE_ABI, functionName: 'approve', args: [spender, 0n], approval: true });
          }
        }
        await write({ label, address: token, abi: APPROVE_ABI, functionName: 'approve', args: [spender, amount], approval: true });
      };

      try {
        const summary = await fn({ account: active.address, write, ensureAllowance });
        await refresh();
        setState({ phase: 'success', title, steps: steps.map((s) => ({ ...s })), summary: summary ?? null });
      } catch (e) {
        setState({ phase: 'error', title, steps: steps.map((s) => ({ ...s })), error: decodeError(e) });
        void refresh();
      } finally {
        setBusy(false);
      }
    },
    [active, claim, effectiveRpcUrl, id, refresh, setBusy],
  );

  const visible = scope.activeId === id ? state : ({ phase: 'idle' } as TxState);
  return {
    state: visible,
    pending: state.phase === 'pending',
    /** Any write in flight anywhere in the app (buttons disable to avoid nonce clashes). */
    busy: scope.busy,
    run,
    reset: () => setState({ phase: 'idle' }),
  };
}

export function TxButton({
  children,
  onClick,
  pending,
  disabled,
  variant = 'primary',
  size,
  ariaLabel,
}: {
  children: string;
  onClick: () => void;
  pending: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'block';
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      className={`btn btn-${variant}${size === 'sm' ? ' btn-sm' : ''}${size === 'block' ? ' btn-block' : ''}`}
      onClick={onClick}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      aria-label={ariaLabel}
    >
      {pending && <span className="spinner spinner-on-accent" aria-hidden="true" />}
      {children}
    </button>
  );
}

const STEP_TEXT: Record<Step['status'], string> = {
  waiting: 'waiting',
  signing: 'simulating and signing…',
  mining: 'waiting for the block…',
  done: 'done',
  failed: 'failed',
};

export function TxPanel({ state }: { state: TxState }) {
  if (state.phase === 'idle') return null;
  const final = [...state.steps].reverse().find((s) => !s.approval && s.hash);
  const earlier = state.steps.filter((s) => s !== final);

  if (state.phase === 'pending') {
    return (
      <div className="tx tx-pending" role="status" aria-live="polite">
        <div className="tx-head">
          <span className="spinner" aria-hidden="true" />
          <strong>{state.title}: in progress</strong>
        </div>
        <ol className="tx-steps">
          {state.steps.map((s, i) => (
            <li key={i} className={`step step-${s.status}`}>
              <span>{s.label}</span>
              <span className="step-status">{STEP_TEXT[s.status]}</span>
              {s.hash && (
                <a href={txUrl(s.hash)} target="_blank" rel="noreferrer">
                  Transaction ↗
                </a>
              )}
            </li>
          ))}
        </ol>
      </div>
    );
  }

  if (state.phase === 'success') {
    return (
      <div className="tx tx-success" role="status" aria-live="polite">
        <div className="tx-head">
          <span className="tx-icon" aria-hidden="true">✓</span>
          <strong>Confirmed</strong>
          <span className="muted">{state.title}</span>
        </div>
        {state.summary && <div className="tx-summary">{state.summary}</div>}
        {final?.hash && (
          <a className="tx-link" href={txUrl(final.hash)} target="_blank" rel="noreferrer">
            View on explorer ↗
          </a>
        )}
        {earlier.some((s) => s.hash) && (
          <ul className="tx-extra">
            {earlier
              .filter((s) => s.hash)
              .map((s, i) => (
                <li key={i}>
                  {s.label}:{' '}
                  <a href={txUrl(s.hash as Hash)} target="_blank" rel="noreferrer">
                    approval transaction ↗
                  </a>
                </li>
              ))}
          </ul>
        )}
      </div>
    );
  }

  const failed = state.steps.find((s) => s.status === 'failed');
  const sentOk = state.steps.filter((s) => s.status === 'done' && s.hash);
  return (
    <div className="tx tx-error" role="alert">
      <div className="tx-head">
        <span className="tx-icon" aria-hidden="true">!</span>
        <strong className="mono">{state.error.name}</strong>
        <span className="muted">{state.title}</span>
      </div>
      <p className="tx-summary">{state.error.message}</p>
      {state.error.detail && (
        <details className="tx-detail">
          <summary>Technical detail</summary>
          <div className="mono-wrap">{state.error.detail}</div>
        </details>
      )}
      <p className="tx-note">
        {failed?.hash ? (
          <>
            The transaction was sent and reverted.{' '}
            <a href={txUrl(failed.hash)} target="_blank" rel="noreferrer">
              Reverted transaction ↗
            </a>
          </>
        ) : failed ? (
          <>Caught in simulation of “{failed.label}”: nothing was sent and no gas was spent.</>
        ) : (
          <>Nothing was sent.</>
        )}
      </p>
      {sentOk.length > 0 && (
        <ul className="tx-extra">
          {sentOk.map((s, i) => (
            <li key={i}>
              {s.label} went through:{' '}
              <a href={txUrl(s.hash as Hash)} target="_blank" rel="noreferrer">
                transaction ↗
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
