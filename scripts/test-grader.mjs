// Regression test for the 1X2 settlement grader (no test runner in the repo,
// so this is a standalone node script: `node scripts/test-grader.mjs`).
// It transpiles src/lib/footballApi.ts (which has NO imports) and exercises the
// REAL exported verifyLegAgainstFixture against synthetic finished fixtures.
//
// Guards the Elche 2-3 Real Madrid mis-grade: a raw "2 1X2 Full Time" (away)
// label must grade off the structured side, not collide with the double-chance
// "1x" substring branch. See docs/investigations/1x2-inversion.md.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Module from 'node:module'
import ts from 'typescript'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = fs.readFileSync(path.join(root, 'src/lib/footballApi.ts'), 'utf8')
const js = ts.transpileModule(src, { compilerOptions: { module: 'CommonJS', target: 'ES2020' } }).outputText
const m = new Module('footballApi')
m._compile(js, path.join(root, 'src/lib/footballApi.ts'))
const { verifyLegAgainstFixture } = m.exports

// Build a finished fixture: home h - a away, with half-time hh - ha.
const fx = (home, away, h, a, hh = 0, ha = 0) => ({
  fixture: { status: { short: 'FT' } },
  goals: { home: h, away: a },
  score: { halftime: { home: hh, away: ha } },
  teams: { home: { name: home }, away: { name: away } },
})

let pass = 0, fail = 0
function check(name, got, want) {
  if (got === want) { pass++; console.log(`  ✓ ${name} → ${got}`) }
  else { fail++; console.log(`  ✗ ${name} → got '${got}', want '${want}'`) }
}

console.log('1X2 grader regression:')

// The actual production bug: Elche 2-3 Real Madrid, pick "2" (away) = WON.
check('away "2 1X2 Full Time", away won (Elche 2-3 RM)',
  verifyLegAgainstFixture('2 1X2 Full Time', fx('Elche', 'Real Madrid', 2, 3, 0, 2),
    { market: 'match_result', side: 'away' }), 'win')

// Mirror: home "1" label when the AWAY team won must LOSE (was a false 'win').
check('home "1 1X2 Full Time", away won',
  verifyLegAgainstFixture('1 1X2 Full Time', fx('Elche', 'Real Madrid', 2, 3),
    { market: 'match_result', side: 'home' }), 'loss')

// Home pick on a DRAW must LOSE (the "1x"→home-or-draw branch falsely won this).
check('home "1 1X2 Full Time" on a 1-1 draw',
  verifyLegAgainstFixture('1 1X2 Full Time', fx('A', 'B', 1, 1),
    { market: 'match_result', side: 'home' }), 'loss')

// Draw pick on a draw wins.
check('draw "X 1X2 Full Time" on a 1-1 draw',
  verifyLegAgainstFixture('X 1X2 Full Time', fx('A', 'B', 1, 1),
    { market: 'match_result', side: 'draw' }), 'win')

// Symbol fallback when side is missing — worker "- 2" trailing format, away won.
check('side-missing, worker label "1x2 | full time - 2", away won',
  verifyLegAgainstFixture('1x2 | full time - 2', fx('A', 'B', 0, 1),
    { market: 'match_result', side: null }), 'win')

// Symbol fallback — leading "1 ..." format, home won.
check('side-missing, "1 1x2 full time", home won',
  verifyLegAgainstFixture('1 1x2 full time', fx('A', 'B', 2, 0),
    { market: 'match_result', side: null }), 'win')

// Unresolvable match_result → manual settle (never a silent mis-grade).
check('match_result with no side and no symbol → unverifiable',
  verifyLegAgainstFixture('full time result', fx('A', 'B', 1, 0),
    { market: 'match_result', side: null }), 'unverifiable')

// Non-regression: a genuine double-chance leg still grades via the string path.
check('double_chance "1x" (home or draw), home won',
  verifyLegAgainstFixture('1x', fx('A', 'B', 2, 0), { market: 'double_chance', side: null }), 'win')

// Non-regression: over/under untouched.
check('match_total "over 2.5", 6 goals',
  verifyLegAgainstFixture('over 2.5 goals', fx('A', 'B', 2, 4), { market: 'match_total', side: 'over', line: 2.5 }), 'win')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
