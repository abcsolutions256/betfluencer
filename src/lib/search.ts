// ── Smart fuzzy search for tipsters ──────────────────────────────
// Handles typos, partial matches, sport/league keywords,
// username fragments, and vague inputs like "premier" or "goals"

import type { TipsterPublic } from '@/types'

// Normalise string — lowercase, remove punctuation, collapse spaces
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
}

// Levenshtein distance — measures how many edits between two strings
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
  return dp[m][n]
}

// Check if query is a substring of target (most important signal)
function containsMatch(target: string, query: string): boolean {
  return norm(target).includes(norm(query))
}

// Fuzzy token match — split query into words, check each
function tokenMatch(target: string, query: string): number {
  const tokens = norm(query).split(' ').filter(Boolean)
  const t = norm(target)
  let score = 0
  for (const token of tokens) {
    if (t.includes(token)) {
      score += 10
    } else {
      // Check levenshtein distance for each word in target
      const words = t.split(' ')
      const minDist = Math.min(...words.map(w => levenshtein(w, token)))
      if (minDist <= 1) score += 7       // 1 typo tolerated
      else if (minDist <= 2) score += 3  // 2 typos — weaker signal
    }
  }
  return score
}

// Sport/league keyword aliases — maps common inputs to searchable terms
const SPORT_ALIASES: Record<string, string[]> = {
  'pl':           ['premier league'],
  'epl':          ['premier league'],
  'prem':         ['premier league'],
  'premier':      ['premier league'],
  'ucl':          ['champions league'],
  'champions':    ['champions league'],
  'champs':       ['champions league'],
  'cl':           ['champions league'],
  'laliga':       ['la liga'],
  'liga':         ['la liga'],
  'spain':        ['la liga'],
  'bundesliga':   ['bundesliga'],
  'german':       ['bundesliga'],
  'germany':      ['bundesliga'],
  'serie':        ['serie a'],
  'italy':        ['serie a'],
  'italian':      ['serie a'],
  'upl':          ['uganda premier league', 'upl'],
  'uganda':       ['uganda', 'upl'],
  'afcon':        ['afcon', 'africa'],
  'africa':       ['afcon', 'africa'],
  'local':        ['upl', 'uganda', 'afcon'],
  'europe':       ['premier league', 'champions league', 'la liga', 'bundesliga', 'serie a'],
  'european':     ['premier league', 'champions league', 'la liga', 'bundesliga'],
  'football':     ['premier league', 'champions league', 'la liga'],
  'soccer':       ['premier league', 'champions league', 'la liga'],
  'goals':        ['over', 'under', 'goals'],
  'over':         ['over'],
  'under':        ['under'],
  'handicap':     ['handicap'],
  'btts':         ['both teams'],
}

function expandQuery(query: string): string[] {
  const q = norm(query)
  const expanded = [q]
  for (const [alias, expansions] of Object.entries(SPORT_ALIASES)) {
    if (q.includes(alias)) {
      expanded.push(...expansions)
    }
  }
  return Array.from(new Set(expanded))
}

// Main score function — returns 0 if no match, higher = better match
function scoreTipster(tipster: TipsterPublic, query: string): number {
  if (!query.trim()) return 1 // empty query = show all

  const queries = expandQuery(query)
  let best = 0

  for (const q of queries) {
    let score = 0

    // Exact name match — highest priority
    if (norm(tipster.name) === q) score += 100
    // Exact username match
    if (norm(tipster.username) === q) score += 100
    // Name starts with query
    if (norm(tipster.name).startsWith(q)) score += 50
    // Username starts with query
    if (norm(tipster.username).startsWith(q)) score += 50
    // Name contains query
    if (containsMatch(tipster.name, q)) score += 30
    // Username contains query
    if (containsMatch(tipster.username, q)) score += 30
    // Sport/description contains query
    if (containsMatch(tipster.sport, q)) score += 20
    if (containsMatch(tipster.description, q)) score += 10
    // Fuzzy token match on name
    score += tokenMatch(tipster.name, q)
    // Fuzzy token match on username
    score += tokenMatch(tipster.username, q)
    // Fuzzy token match on sport
    score += tokenMatch(tipster.sport, q) * 0.8

    best = Math.max(best, score)
  }

  return best
}

// ── PUBLIC API ────────────────────────────────────────────────────

export interface SearchResult {
  tipster:  TipsterPublic
  score:    number
  matched:  string   // what field matched — for UI highlighting
}

export function searchTipsters(
  tipsters: TipsterPublic[],
  query: string,
  minScore = 3
): TipsterPublic[] {
  if (!query.trim()) return tipsters // empty = show all

  const results: SearchResult[] = tipsters
    .map(t => ({ tipster: t, score: scoreTipster(t, query), matched: '' }))
    .filter(r => r.score >= minScore)
    .sort((a, b) => b.score - a.score)

  return results.map(r => r.tipster)
}

// Highlight matching text in a string
export function highlight(text: string, query: string): string {
  if (!query.trim()) return text
  const q = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text.replace(new RegExp(`(${q})`, 'gi'), '<mark>$1</mark>')
}
