# contracts

Foundry project for the five Standby contracts. The spec is `docs/interfaces.md` section 5; build exactly that.

```bash
git submodule update --init   # forge-std v1.17.0, OpenZeppelin v5.6.1
forge build
forge test --match-contract <Name> -q
```

Deploying and verifying on Whitechain Sepolia (chain 1874) comes in C1 (spike) and C5 (`script/Deploy.s.sol`, `script/Seed.s.sol`). The verifier is Blockscout: `--verifier blockscout --verifier-url https://explorer.testnet.whitechain.io/api/`.
