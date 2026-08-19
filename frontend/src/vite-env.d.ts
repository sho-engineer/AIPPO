/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  /** 運営者の情報（`src/content/legal.ts`）。公開する配置で入れる。 */
  readonly VITE_OPERATOR_NAME?: string;
  readonly VITE_OPERATOR_ADDRESS?: string;
  readonly VITE_OPERATOR_CONTACT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
