/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_HOSTED_MODE?: string;
  readonly VITE_DEV_SERVER_PORT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
