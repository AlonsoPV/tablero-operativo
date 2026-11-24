import { fileURLToPath } from 'node:url'

export default {
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['api/_shared/memory/*.test.ts', 'scripts/qa/r3*.test.mjs'],
  },
}
