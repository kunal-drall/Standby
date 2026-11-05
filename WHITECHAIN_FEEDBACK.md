# Whitechain feedback

Notes from building Standby on Whitechain Sepolia (chain 1874) at ETHGlobal Mumbai. The first section lists only things we observed while building, with how we checked them. The team's own opinions go in the second section.

## What we observed

| Area | Observation | How we saw it |
|---|---|---|
| RPC naming | `https://rpc.testnet.whitechain.io` is chain 1874 (Whitechain Sepolia). `https://rpc-testnet.whitechain.io` (hyphen) answers chain 2625, a different network. One character apart, easy to mix up when copying from older material. | `eth_chainId` returned `0x752` vs `0xa41` |
| Client | The testnet RPC reports `op-reth/v2.8.1`; blocks carry `blobGasUsed`, `excessBlobGas`, `parentBeaconBlockRoot` and `requestsHash`, so Cancun opcodes are available. We compile with `evm_version = "cancun"`. | `web3_clientVersion`, `eth_getBlockByNumber` |
| Test USDT | `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7` is a proxy (implementation `0x26425662…26F7`), symbol `USDT`, name `Tether USD`, 6 decimals. | `eth_call` to `decimals()`, `symbol()`, `name()`; EIP-1967 implementation slot |
| Forking | On an anvil fork, `anvil_dealERC20` cannot find the USDT balance slot. The implementation is an OpenZeppelin v4 upgradeable ERC-20 whose balances mapping is at slot 51; setting that slot works. Worth a line in the docs for teams that rehearse on a fork. | `scripts/local-chain.sh` |
| Foundry | Chain 1874 is not in Foundry's built-in chain list: an `[etherscan]` entry with `chain = 1874` in `foundry.toml` makes `forge script --broadcast` fail with "Chain 1874 not supported". Passing `--verifier blockscout --verifier-url https://explorer.testnet.whitechain.io/api/` on the command line avoids it. | `forge script` on the fork |
| Faucet | The WBT faucet needs a GitHub login and a Cloudflare Turnstile check, so wallets cannot be funded from a script or a headless test run. | `https://faucet.testnet.whitechain.io` page source |
| Explorer | The Blockscout API answers at `https://explorer.testnet.whitechain.io/api/v2/stats`. | HTTP 200 |

TODO(kunal): add the result of Blockscout verification from the first testnet deploy (`scripts/deploy-testnet.sh`), and how long blocks and receipts took.

## What the team thinks

TODO(kunal): the team's own notes: what was easy, what was hard, what we would ask Whitechain for. Write only what the team actually experienced.
