#!/usr/bin/env node
// Emits `countries.about_content` seed/update SQL from the ABOUT_CONTENT
// map in src/lib/aboutContent.ts, so the TS module (fallback) and the DB
// copy never drift. Usage:
//   node scripts/generate-about-seed.js            > update.sql   (overwrite)
//   node scripts/generate-about-seed.js --if-null  > seed.sql     (initial seed)
//
// aboutContent.ts is self-contained (no external imports) and composes each
// market from shared helpers, so we transpile it with the TypeScript compiler
// to a temp CommonJS file and require() it — reading the resolved
// ABOUT_CONTENT rather than eval-slicing the literal. getAboutContent()'s
// fetch/process.env references live inside a function body, so loading the
// module never executes them.
const fs = require('fs')
const os = require('os')
const path = require('path')
const ts = require('typescript')

const guardNull = process.argv.includes('--if-null')
const srcPath = path.join(__dirname, '..', 'src', 'lib', 'aboutContent.ts')
const src = fs.readFileSync(srcPath, 'utf8')

const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText

const tmp = path.join(os.tmpdir(), `about-content.${process.pid}.cjs`)
fs.writeFileSync(tmp, js)
let content
try {
  content = require(tmp).ABOUT_CONTENT
} finally {
  fs.unlinkSync(tmp)
}
if (!content || typeof content !== 'object') throw new Error('ABOUT_CONTENT not found after transpile')

let out = ''
for (const [code, about] of Object.entries(content)) {
  const json = JSON.stringify(about)
  if (json.includes('$about$')) throw new Error('dollar-quote collision')
  const where = guardNull ? ` and about_content is null` : ''
  out += `update countries set about_content = $about$${json}$about$::jsonb\n  where code = '${code}'${where};\n\n`
}
process.stdout.write(out)
