// ── Claude Vision — Betslip Screenshot Parser ────────────────────
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { rateLimit, getClientIP, rateLimitResponse } from '@/lib/rateLimit'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' })

export async function POST(req: NextRequest) {
  // Rate limit — 5 parses per minute per IP
  const ip = getClientIP(req)
  const rl = rateLimit('parse-slip', ip)
  if (!rl.allowed) return rateLimitResponse(rl.resetIn)

  try {
    const formData = await req.formData()
    const file     = formData.get('image') as File | null
    if (!file) return NextResponse.json({ error: 'No image provided' }, { status: 400 })

    const buffer   = await file.arrayBuffer()
    const base64   = Buffer.from(buffer).toString('base64')
    const mimeType = (file.type || 'image/jpeg') as 'image/jpeg'|'image/png'|'image/webp'|'image/gif'

    const today = new Date().toISOString().split('T')[0]

    const response = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
          { type: 'text', text: `Today's date is ${today}. You are reading a sports betting slip screenshot. Extract every leg/selection from this betslip.
Return ONLY a valid JSON object with this exact structure, no other text:
{
  "betting_site": "name of the betting platform",
  "total_odds": 12.40,
  "stake": 1000,
  "potential_win": 12400,
  "legs": [
    {
      "match": "Home Team vs Away Team",
      "league": "league or competition name",
      "pick": "fully unambiguous selection, e.g. Croatia Over 0.5 Goals",
      "odds": 1.95,
      "match_time": "YYYY-MM-DDTHH:MM:00Z or null if not visible",
      "market": "match_result|match_total|team_total|btts|double_chance|draw_no_bet|handicap|asian_handicap|ht_result|ht_total|clean_sheet|exact_score|first_to_score|win_margin|total_cards|total_corners|player_to_score|other",
      "market_subject": "the exact team or player the selection applies to, verbatim from the slip; 'match' for whole-match markets",
      "side": "over|under|yes|no|home|draw|away|null",
      "line": 0.5
    }
  ]
}
Rules:
- Extract ALL legs visible on the slip
- The "match" field MUST be in the exact format "Home Team vs Away Team" using the real team names shown. Do not abbreviate.
- For match_time: ALWAYS provide a full date. If the slip shows a date, use it. If it shows only a time (e.g. "Today 18:30", "20:00"), combine it with today's date provided above. Only use null if there is genuinely no time or date anywhere on the slip. Format: YYYY-MM-DDTHH:MM:00Z
- MARKET / SUBJECT / SIDE / LINE — read these carefully, they are the point of this task:
  * Bookmakers write team-total markets as a multi-part label, e.g. "Over/Under | Croatia | Full Time - Over (0.5)". The MIDDLE segment (here "Croatia") is the TEAM the total applies to — it means THAT team's goals, NOT the match total. NEVER discard the team segment.
  * If a total applies to ONE team → market="team_total", market_subject=that team (verbatim), side="over" or "under", line=the number (e.g. 0.5), and pick MUST name the team, e.g. "Croatia Over 0.5 Goals". Never output a bare "Over 0.5" for a team total.
  * If a total applies to the WHOLE match → market="match_total", market_subject="match", side="over"/"under", line=the number, pick="Over 2.5".
  * Match result (1X2) → market="match_result", market_subject="match", side="home"/"draw"/"away", line=null, pick="Home Win" / "Draw" / "Away Win" (or the team name + " Win").
  * Both teams to score → market="btts", market_subject="match", side="yes"/"no", line=null, pick="Both Teams To Score" or "Both Teams To Score - No".
  * For any other market, choose the closest market value, set market_subject to the team/player it concerns ("match" if whole-match), and set side/line to null when they do not apply.
- For pick: it is rendered DIRECTLY to users and must be fully unambiguous and self-contained. Include the team/player name whenever the selection is about a specific team or player.
- For odds: decimal format only (1.95 not 19/10)
- If total_odds not shown, multiply all leg odds together
- Return only the JSON, no markdown, no explanation` },
        ],
      }],
    })

    const text  = response.content[0].type === 'text' ? response.content[0].text : ''
    const clean = text.replace(/```json|```/g, '').trim()

    try {
      const parsed = JSON.parse(clean)
      return NextResponse.json({ success: true, slip: parsed })
    } catch {
      return NextResponse.json({ error: 'Could not parse betslip — try a clearer screenshot', raw: text }, { status: 422 })
    }
  } catch (err: any) {
    console.error('parse-slip error:', err)
    return NextResponse.json({ error: err.message ?? 'Failed to parse screenshot' }, { status: 500 })
  }
}
