/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RPC_URL?: string;
  readonly VITE_USDT_ADDRESS?: string;
  readonly VITE_REGISTRY_ADDRESS?: string;
  readonly VITE_ASSET_ADDRESS?: string;
  readonly VITE_ORACLE_ADDRESS?: string;
  readonly VITE_BIDBOOK_ADDRESS?: string;
  readonly VITE_MARKET_ADDRESS?: string;
  readonly VITE_START_BLOCK?: string;
  readonly VITE_DOCS_URL?: string;
  readonly VITE_KEEPER_API?: string;
  readonly VITE_ISSUER_PK?: string;
  readonly VITE_LENDER_PK?: string;
  readonly VITE_BUYER1_PK?: string;
  readonly VITE_BUYER2_PK?: string;
  readonly VITE_BORROWER_PK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
