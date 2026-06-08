// ── Claude Vision — Betslip Screenshot Parser ─────────────────────
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

    const response = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
          { type: 'text', text: `You are reading a sports betting slip screenshot. Extract every leg/selection from this betslip.

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
      "pick": "the selection e.g. Over 2.5 goals",
      "odds": 1.95,
      "match_time": "YYYY-MM-DDTHH:MM:00Z or null if not visible",
      "market": "match_result|over_under|btts|double_chance|handicap|ht_result|clean_sheet|exact_score|score_first|win_margin|total_cards|player_score|player_first|corners|asian_handicap|other"
    }
  ]
}

Rules:
- Extract ALL legs visible on the slip
- For match_time: use today's date if only time shown, null if unclear
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
