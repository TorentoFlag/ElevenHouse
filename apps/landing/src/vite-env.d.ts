/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ASTROLOGER_WEB_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
