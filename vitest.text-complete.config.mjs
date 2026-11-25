import { fileURLToPath } from 'node:url'

export default {
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['scripts/qa/textComplete.test.mjs'],
  },
}
