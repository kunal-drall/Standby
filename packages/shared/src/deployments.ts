import type { Address } from 'viem';
import raw from './deployments.json' with { type: 'json' };

export const CONTRACT_NAMES = [
  'AllowlistRegistry',
  'RestrictedAsset',
  'NavOracle',
  'BidBook',
  'StandbyMarket',
] as const;
export type ContractName = (typeof CONTRACT_NAMES)[number];

export type Deployments = {
  chainId: number;
  usdt: Address;
  /** First block to scan for events; set by the deploy script. */
  startBlock: number;
  /** Empty string until deployed. */
  contracts: Record<ContractName, Address | ''>;
};

/** Written by contracts/script/Deploy.s.sol (C5). Empty addresses until then. */
export const deployments = raw as Deployments;

export function isDeployed(d: Deployments = deployments): boolean {
  return CONTRACT_NAMES.every((name) => /^0x[0-9a-fA-F]{40}$/.test(d.contracts[name]));
}

/** Address of a deployed contract; throws with a clear message before C5 has run. */
export function contractAddress(name: ContractName, d: Deployments = deployments): Address {
  const address = d.contracts[name];
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error(`${name} is not deployed yet (packages/shared/src/deployments.json)`);
  }
  return address as Address;
}
