#!/usr/bin/env node
// Emits the `countries.about_content` seed SQL from the ABOUT_CONTENT
// map in src/lib/aboutContent.ts, so the TS module (fallback) and the
// DB seed can never drift. Usage:
//   node scripts/generate-about-seed.js > /tmp/seed.sql
// The module keeps the const LAST in the file with a pure-data body —
// this script slices out the object literal and evals it.
const fs = require('fs')
const path = require('path')

const src = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'lib', 'aboutContent.ts'),
  'utf8',
)
const marker = 'export const ABOUT_CONTENT: Record<string, AboutContent> = '
const start = src.indexOf(marker)
if (start === -1) throw new Error('ABOUT_CONTENT marker not found')
let literal = src.slice(start + marker.length).trim()
if (literal.endsWith(';')) literal = literal.slice(0, -1)

// eslint-disable-next-line no-eval
const content = eval('(' + literal + ')')

let out = ''
for (const [code, about] of Object.entries(content)) {
  const json = JSON.stringify(about)
  if (json.includes('$about$')) throw new Error('dollar-quote collision')
  out +=
    `update countries set about_content = $about$${json}$about$::jsonb\n` +
    `  where code = '${code}' and about_content is null;\n\n`
}
process.stdout.write(out)
