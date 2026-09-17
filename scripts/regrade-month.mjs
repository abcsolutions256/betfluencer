// Re-grade this month's settled slips with the FIXED grader and (with --apply)
// correct any slip whose auto-verification the 1X2 bug got wrong.
//
//   node scripts/regrade-month.mjs            # DRY RUN — prints changes only
//   node scripts/regrade-month.mjs --apply    # writes leg + slip results + audit
//   node scripts/regrade-month.mjs --month=2026-09
//
// It transpiles the REAL src/lib/footballApi.ts grader and re-checks each leg
// against api-football by its stored fixture_id (quota-light, cached per
// fixture). Slip result is recomputed with the accumulator rule. Every change
// is logged to betslip_settlement_audit (source='regrade'); if that table is
// not present yet the write still proceeds and the audit insert is skipped
// with a warning.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Module from 'node:module'
import ts from 'typescript'
import { createClient } from '@supabase/supabase-js'

const APPLY = process.argv.includes('--apply')
const monthArg = (process.argv.find(a => a.startsWith('--month=')) || '').split('=')[1] || '2026-09'
const [Y, M] = monthArg.split('-').map(Number)
const start = new Date(Date.UTC(Y, M - 1, 1)).toISOString()
const end   = new Date(Date.UTC(Y, M, 1)).toISOString()

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const env = {}
for (const raw of fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) {
  const l = raw.replace(/\r$/, '').trim(); if (!l || l.startsWith('#')) continue
  const m = l.replace(/^export\s+/, '').match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/)
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const FKEY = env.FOOTBALL_API_KEY

// Load the real grader from source (footballApi.ts has no imports).
const jsSrc = ts.transpileModule(fs.readFileSync(path.join(root, 'src/lib/footballApi.ts'), 'utf8'),
  { compilerOptions: { module: 'CommonJS', target: 'ES2020' } }).outputText
const fam = new Module('footballApi'); fam._compile(jsSrc, path.join(root, 'src/lib/footballApi.ts'))
const { verifyLegAgainstFixture } = fam.exports

const fixtureCache = new Map()
async function getFixture(id) {
  if (fixtureCache.has(id)) return fixtureCache.get(id)
  const r = await fetch('https://v3.football.api-sports.io/fixtures?id=' + id, { headers: { 'x-apisports-key': FKEY } }).then(x => x.json()).catch(() => null)
  const f = r?.response?.[0] ?? null
  fixtureCache.set(id, f); return f
}

const norm = (r) => (r === 'unverifiable' ? 'pending' : r)   // ungradeable → not decided
function slipFromLegs(rs) {
  const hasLoss = rs.some(r => r === 'loss')
  const hasPend = rs.some(r => !r || r === 'pending')
  const allVoid = rs.length > 0 && rs.every(r => r === 'void')
  return hasLoss ? 'loss' : allVoid ? 'void' : !hasPend ? 'win' : 'pending'
}

;(async () => {
  console.log(`Re-grade ${monthArg}  (${APPLY ? 'APPLY' : 'DRY RUN'})\n`)
  const { data: slips } = await db.from('betslips')
    .select('id, result, total_odds, settled_at, tipsters(name), betslip_legs(id, match, pick, result, fixture_id, market, market_subject, side, line)')
    .gte('settled_at', start).lt('settled_at', end).in('result', ['win', 'loss', 'void']).limit(1000)

  let changed = 0, auditMissing = false
  for (const s of slips ?? []) {
    const legs = s.betslip_legs ?? []
    const newLegs = []
    for (const leg of legs) {
      let nr = leg.result
      if (leg.fixture_id) {
        const fx = await getFixture(leg.fixture_id)
        if (fx) nr = norm(verifyLegAgainstFixture(String(leg.pick).toLowerCase().trim(), fx,
          { market: leg.market, market_subject: leg.market_subject, side: leg.side, line: leg.line }))
      }
      newLegs.push({ ...leg, newResult: nr })
    }
    const newSlip = slipFromLegs(newLegs.map(l => l.newResult))
    const legChanges = newLegs.filter(l => (l.newResult ?? null) !== (l.result ?? null))
    if (newSlip === s.result && legChanges.length === 0) continue

    changed++
    console.log(`SLIP ${s.id.slice(0, 8)} · ${s.tipsters?.name ?? '?'} · ×${s.total_odds}`)
    console.log(`  slip: ${s.result} → ${newSlip}${newSlip === s.result ? ' (unchanged)' : ''}`)
    for (const l of legChanges) console.log(`  leg ${String(l.pick).slice(0, 34).padEnd(34)} ${l.result ?? '—'} → ${l.newResult} ${l.fixture_id ? '(fx ' + l.fixture_id + ')' : ''}`)

    if (APPLY) {
      for (const l of legChanges) {
        await db.from('betslip_legs').update({ result: l.newResult }).eq('id', l.id)
        const a = await db.from('betslip_settlement_audit').insert({ betslip_id: s.id, leg_id: l.id, actor: 'system', source: 'regrade', field: 'leg_result', old_value: l.result ?? null, new_value: l.newResult, note: '1X2 grader fix re-grade' })
        if (a.error && /relation .*betslip_settlement_audit/.test(a.error.message)) auditMissing = true
      }
      if (newSlip !== s.result) {
        await db.from('betslips').update({ result: newSlip, settled_at: newSlip === 'pending' ? null : new Date().toISOString(), result_proof_pending: newSlip === 'pending' }).eq('id', s.id)
        const a = await db.from('betslip_settlement_audit').insert({ betslip_id: s.id, actor: 'system', source: 'regrade', field: 'result', old_value: s.result, new_value: newSlip, note: '1X2 grader fix re-grade' })
        if (a.error && /relation .*betslip_settlement_audit/.test(a.error.message)) auditMissing = true
      }
    }
    console.log('')
  }

  console.log(`${changed} slip(s) ${APPLY ? 'updated' : 'would change'} · ${fixtureCache.size} fixtures fetched`)
  if (auditMissing) console.log('⚠  betslip_settlement_audit not found — apply migration 0016 to log the trail.')
  if (!APPLY && changed) console.log('\nRe-run with --apply to write these changes.')
})().catch(e => console.error('ERR', e.message))
