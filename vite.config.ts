import fs from 'node:fs'
import path from 'path'
import react from '@vitejs/plugin-react'
import { loadEnv, type ProxyOptions } from 'vite'
import { defineConfig } from 'vitest/config'
import { localApiPlugin } from './vite.apiPlugin'

/** QA WSL run-tree may symlink src → Windows path; Vite fs.strict must allow the real root. */
function qaFsAllow(): string[] {
  const roots = [path.resolve(__dirname)]
  try {
    roots.push(path.dirname(fs.realpathSync(path.join(__dirname, 'src'))))
  } catch {}
  return [...new Set(roots)]
}

/** QA local only: browser talks to Vite (same origin); Node proxies to QA A loopback. */
function qaALoopbackTarget(env: Record<string, string>): string | null {
  if (env.QA_LOCAL !== '1') return null
  const raw = env.SUPABASE_URL || env.QA_A_SUPABASE_URL || ''
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return null
  }
  const blocked = /xhpasmjzuwifmjhrsumb|tgiuevzlyptzlfgxsfhj|supabase\.co/i.test(raw)
  if (blocked) return null
  if (parsed.protocol !== 'http:') return null
  if (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') return null
  if (parsed.port !== '54421') return null
  return `http://127.0.0.1:54421`
}

function qaSupabaseProxy(target: string): Record<string, ProxyOptions> {
  const proxy: ProxyOptions = {
    target,
    // Host must match QA A Kong on loopback; does not rewrite Authorization/apikey.
    changeOrigin: true,
    secure: false,
    ws: false,
    configure(proxyServer) {
      proxyServer.on('proxyReq', (proxyReq, req) => {
        const auth = req.headers.authorization
        const apikey = req.headers.apikey
        if (auth && !proxyReq.getHeader('authorization')) proxyReq.setHeader('authorization', auth)
        if (apikey && !proxyReq.getHeader('apikey')) proxyReq.setHeader('apikey', apikey)
      })
    },
  }
  return {
    '/auth/v1': proxy,
    '/rest/v1': proxy,
    '/storage/v1': proxy,
  }
}

/** Browser modules must call Vite, never :54421 or inherited example.supabase.co. */
function qaSameOriginEnvPlugin(enabled: boolean) {
  const to = 'http://127.0.0.1:5180'
  const rewrite = (code: string) =>
    code
      .replace(/(["']VITE_SUPABASE_URL["']\s*:\s*["'])[^"']+(["'])/g, `$1${to}$2`)
      .replaceAll('http://127.0.0.1:54421', to)
      .replaceAll('https://example.supabase.co', to)
      .replaceAll('http://example.supabase.co', to)
  return {
    name: 'qa-same-origin-supabase',
    enforce: 'post' as const,
    apply: 'serve' as const,
    configResolved(config) {
      if (!enabled) return
      config.env.VITE_SUPABASE_URL = to
    },
    transform: {
      order: 'post' as const,
      handler(code: string) {
        if (!enabled) return
        const next = rewrite(code)
        if (next === code) return
        return { code: next, map: null }
      },
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const qaTarget = mode === 'qa' ? qaALoopbackTarget(env) : null
  if (qaTarget) {
    // Same-origin browser URL; ignore inherited VITE_SUPABASE_URL (e.g. example.supabase.co).
    process.env.VITE_SUPABASE_URL = 'http://127.0.0.1:5180'
  }
  return {
    define: {
      __AGENT_ORCHESTRATOR_R1__: JSON.stringify(env.AGENT_ORCHESTRATOR_R1 === '1'),
    },
    plugins: [qaSameOriginEnvPlugin(Boolean(qaTarget)), react(), localApiPlugin()],
    ...(qaTarget
      ? {
          server: {
            host: '127.0.0.1',
            port: 5180,
            strictPort: true,
            fs: { strict: true, allow: qaFsAllow() },
            proxy: qaSupabaseProxy(qaTarget),
          },
        }
      : {}),
    build: {
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return
            if (id.includes('@supabase')) return 'vendor-supabase'
            if (id.includes('@tanstack')) return 'vendor-query'
            if (id.includes('@radix-ui')) return 'vendor-radix'
            if (id.includes('@dnd-kit')) return 'vendor-dnd'
            if (id.includes('lucide-react')) return 'vendor-icons'
            if (id.includes('react-dom') || id.includes('react-router-dom') || id.includes('react')) {
              return 'vendor-react'
            }
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    test: {
      globals: true,
      environment: 'node',
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'api/**/*.test.ts'],
    },
  }
})
