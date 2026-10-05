import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'lib',
  format: 'esm',
  deps: {
    neverBundle: ['coc.nvim'],
  },
  outputOptions: {
    codeSplitting: false,
  },
  outExtensions: () => ({ js: '.js' }),
})
