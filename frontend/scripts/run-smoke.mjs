// 用仓库已有的 esbuild 把 TS 冒烟脚本打包成临时 CJS 再跑，不引入新依赖。
import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'
import { rmSync } from 'node:fs'

const out = 'node_modules/.cache-smoke-inspection.cjs'
await build({
  entryPoints: ['scripts/smoke-inspection.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: out,
})
try {
  await import(pathToFileURL(out).href)
} finally {
  rmSync(out, { force: true })
}
