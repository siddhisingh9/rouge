/// <reference types="vite/client" />

// Public build-time settings (spec §9.1). Only the anon/publishable key — never the
// service-role key.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
