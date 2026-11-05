// User settings: active party, theme, number format, RPC URL and per-party key overrides. Kept in
// localStorage only (never sent anywhere). Keys are never logged or rendered.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Address, Hex } from 'viem';
import { DEFAULT_RPC_URL, ENV_KEYS, normalizeKey } from '../config';
import { accountFor } from '../lib/clients';
import type { NumberFormat } from '../lib/format';
import { readJson, writeJson } from '../lib/storage';
import { isParty, PARTIES, type Party } from '../routes';

export type Theme = 'system' | 'light' | 'dark';

type Stored = { party: Party; theme: Theme; numberFormat: NumberFormat; rpcUrl: string | null };

const SETTINGS_KEY = 'standby:settings';
const KEYS_KEY = 'standby:keys';

export type PartyWallet = { party: Party; address: Address; key: Hex; source: 'env' | 'override' };

type SettingsValue = Stored & {
  /** RPC URL in use: the override, else VITE_RPC_URL, else the shared default. */
  effectiveRpcUrl: string;
  wallets: Record<Party, PartyWallet | null>;
  active: PartyWallet | null;
  overrides: Partial<Record<Party, true>>;
  setParty: (party: Party) => void;
  setTheme: (theme: Theme) => void;
  setNumberFormat: (format: NumberFormat) => void;
  setRpcUrl: (url: string | null) => void;
  /** Returns false if the key is not 32 bytes of hex. */
  setKeyOverride: (party: Party, key: string | null) => boolean;
  /** Address label for known party wallets. */
  labelOf: (address: string | undefined | null) => Party | null;
};

const SettingsContext = createContext<SettingsValue | null>(null);

function loadStored(): Stored {
  const raw = readJson<Stored>(SETTINGS_KEY) ?? {};
  return {
    party: isParty(raw.party) ? raw.party : 'Issuer',
    theme: raw.theme === 'light' || raw.theme === 'dark' ? raw.theme : 'system',
    numberFormat: raw.numberFormat === 'compact' ? 'compact' : 'full',
    rpcUrl: typeof raw.rpcUrl === 'string' && /^https?:\/\//.test(raw.rpcUrl) ? raw.rpcUrl : null,
  };
}

function loadKeys(): Partial<Record<Party, Hex>> {
  const raw = readJson<Record<string, string>>(KEYS_KEY) ?? {};
  const out: Partial<Record<Party, Hex>> = {};
  for (const party of PARTIES) {
    const key = normalizeKey(raw[party]);
    if (key) out[party] = key;
  }
  return out;
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<Stored>(loadStored);
  const [keys, setKeys] = useState<Partial<Record<Party, Hex>>>(loadKeys);

  useEffect(() => writeJson(SETTINGS_KEY, stored), [stored]);
  useEffect(() => applyTheme(stored.theme), [stored.theme]);

  const wallets = useMemo(() => {
    const out = {} as Record<Party, PartyWallet | null>;
    for (const party of PARTIES) {
      const override = keys[party];
      const key = override ?? ENV_KEYS[party];
      out[party] = key ? { party, key, address: accountFor(key).address, source: override ? 'override' : 'env' } : null;
    }
    return out;
  }, [keys]);

  const setKeyOverride = useCallback((party: Party, value: string | null) => {
    if (value === null) {
      setKeys((prev) => {
        const next = { ...prev };
        delete next[party];
        writeJson(KEYS_KEY, next);
        return next;
      });
      return true;
    }
    const key = normalizeKey(value);
    if (!key) return false;
    setKeys((prev) => {
      const next = { ...prev, [party]: key };
      writeJson(KEYS_KEY, next);
      return next;
    });
    return true;
  }, []);

  const value = useMemo<SettingsValue>(() => {
    const byAddress = new Map<string, Party>();
    for (const party of PARTIES) {
      const w = wallets[party];
      if (w && !byAddress.has(w.address.toLowerCase())) byAddress.set(w.address.toLowerCase(), party);
    }
    const overrides: Partial<Record<Party, true>> = {};
    for (const party of PARTIES) if (keys[party]) overrides[party] = true;
    return {
      ...stored,
      effectiveRpcUrl: stored.rpcUrl ?? DEFAULT_RPC_URL,
      wallets,
      active: wallets[stored.party],
      overrides,
      setParty: (party) => setStored((s) => ({ ...s, party })),
      setTheme: (theme) => setStored((s) => ({ ...s, theme })),
      setNumberFormat: (numberFormat) => setStored((s) => ({ ...s, numberFormat })),
      setRpcUrl: (rpcUrl) => setStored((s) => ({ ...s, rpcUrl })),
      setKeyOverride,
      labelOf: (address) => (address ? byAddress.get(address.toLowerCase()) ?? null : null),
    };
  }, [stored, wallets, keys, setKeyOverride]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsValue {
  const value = useContext(SettingsContext);
  if (!value) throw new Error('useSettings outside SettingsProvider');
  return value;
}
