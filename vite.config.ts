/* eslint-disable @typescript-eslint/ban-ts-comment */

import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => {
  const plugins = [react(), tailwindcss()]

  try {
    // @ts-ignore
    const m = await import('./.vite-source-tags.js')
    plugins.push(m.sourceTags())
  } catch {
    // ignore
  }

  const env = loadEnv(mode, process.cwd(), [
    'VITE_',
    'NEXT_PUBLIC_',
  ])

  const processEnvDefines: Record<string, string> = {}

  for (const [key, value] of Object.entries(env)) {
    processEnvDefines[`process.env.${key}`] =
      JSON.stringify(value)
  }

  return {
    plugins,

    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],

    define: processEnvDefines,

    // React frontend → Express backend
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
  }
})
