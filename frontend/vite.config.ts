import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv, type Plugin, type PluginOption} from 'vite';
import { createClinicSearchMiddleware } from './src/server/clinicSearch';
import { createLlmTriageMiddleware } from './src/server/llmTriage';

const llmTriagePlugin = (zaiApiKey?: string, groqApiKey?: string, openRouterApiKey?: string): Plugin => ({
  name: 'llm-triage-api',
  configureServer(server) {
    server.middlewares.use(createLlmTriageMiddleware(zaiApiKey, groqApiKey, openRouterApiKey));
  },
});

const clinicSearchPlugin = (authToken?: string): Plugin => ({
  name: 'clinic-search-api',
  configureServer(server) {
    server.middlewares.use(createClinicSearchMiddleware(authToken));
  },
});

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const plugins = [
    react(),
    tailwindcss(),
    llmTriagePlugin(env.ZAI_API_KEY, env.GROQ_API_KEY, env.OPENROUTER_API_KEY),
    clinicSearchPlugin(env.AUTH_TOKEN),
  ] as unknown as PluginOption[];

  return {
    plugins,
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
