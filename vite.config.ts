import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {defineConfig, loadEnv} from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function tryLoadEnvEnc(): void {
  const encPath = path.join(__dirname, '.env.enc');
  if (!existsSync(encPath)) return;
  try {
    const envEnc = require('@chainlink/env-enc') as {
      config: (opts?: {path?: string}) => void;
    };
    envEnc.config({path: encPath});
  } catch {
    console.warn(
      '[vite] .env.enc exists but could not be decrypted (run `npx env-enc set-pw` in this shell, or use plain .env).'
    );
  }
}

export default defineConfig(({mode}) => {
  tryLoadEnvEnc();
  const env = loadEnv(mode, '.', '');
  const geminiKey = process.env.GEMINI_API_KEY || env.GEMINI_API_KEY || '';
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(geminiKey),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
