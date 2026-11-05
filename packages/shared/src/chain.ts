import { defineChain, type Address, type Chain, type Hash } from 'viem';
import { CHAIN_ID, CHAIN_NAME, EXPLORER_URL, NATIVE_SYMBOL, RPC_URL } from './constants.js';

export const whitechainSepolia: Chain = defineChain({
  id: CHAIN_ID,
  name: CHAIN_NAME,
  nativeCurrency: { name: 'WhiteBIT Coin', symbol: NATIVE_SYMBOL, decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: 'Blockscout', url: EXPLORER_URL } },
  testnet: true,
});

export function txUrl(hash: Hash | string): string {
  return `${EXPLORER_URL}/tx/${hash}`;
}

export function addressUrl(address: Address | string): string {
  return `${EXPLORER_URL}/address/${address}`;
}

export function blockUrl(block: bigint | number): string {
  return `${EXPLORER_URL}/block/${block}`;
}
