/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DOCS_URL?: string;
  readonly VITE_RPC_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
