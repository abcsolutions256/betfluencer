// ── All football leagues & competitions on Betfluencer ────────────

export interface League {
  id:       string
  name:     string
  region:   string
  flag:     string   // emoji flag
  tier:     'world' | 'europe' | 'africa' | 'asia' | 'americas' | 'local'
}

export const LEAGUES: League[] = [

  // ── WORLD ────────────────────────────────────────────────────────
  { id:'fifa-wc',         name:'FIFA World Cup',             region:'World',          flag:'🌍', tier:'world'   },
  { id:'fifa-wc-qual',    name:'World Cup Qualifiers',       region:'World',          flag:'🌍', tier:'world'   },
  { id:'fifa-cwc',        name:'Club World Cup',             region:'World',          flag:'🏆', tier:'world'   },
  { id:'fifa-confed',     name:'FIFA Confederations Cup',    region:'World',          flag:'🌐', tier:'world'   },

  // ── UEFA (EUROPE) ─────────────────────────────────────────────────
  { id:'ucl',             name:'UEFA Champions League',      region:'Europe',         flag:'⭐', tier:'europe'  },
  { id:'uel',             name:'UEFA Europa League',         region:'Europe',         flag:'🟠', tier:'europe'  },
  { id:'uecl',            name:'UEFA Conference League',     region:'Europe',         flag:'🔵', tier:'europe'  },
  { id:'euro',            name:'UEFA Euro',                  region:'Europe',         flag:'🇪🇺', tier:'europe'  },
  { id:'euro-qual',       name:'Euro Qualifiers',            region:'Europe',         flag:'🇪🇺', tier:'europe'  },
  { id:'uefa-nl',         name:'UEFA Nations League',        region:'Europe',         flag:'🇪🇺', tier:'europe'  },

  // ── TOP 5 EUROPEAN LEAGUES ────────────────────────────────────────
  { id:'epl',             name:'Premier League',             region:'England',        flag:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', tier:'europe'  },
  { id:'championship',    name:'EFL Championship',           region:'England',        flag:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', tier:'europe'  },
  { id:'efl-l1',          name:'EFL League One',             region:'England',        flag:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', tier:'europe'  },
  { id:'fa-cup',          name:'FA Cup',                     region:'England',        flag:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', tier:'europe'  },
  { id:'carabao',         name:'Carabao Cup',                region:'England',        flag:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', tier:'europe'  },
  { id:'laliga',          name:'La Liga',                    region:'Spain',          flag:'🇪🇸', tier:'europe'  },
  { id:'laliga2',         name:'La Liga 2',                  region:'Spain',          flag:'🇪🇸', tier:'europe'  },
  { id:'copa-del-rey',    name:'Copa del Rey',               region:'Spain',          flag:'🇪🇸', tier:'europe'  },
  { id:'bundesliga',      name:'Bundesliga',                 region:'Germany',        flag:'🇩🇪', tier:'europe'  },
  { id:'bundesliga2',     name:'2. Bundesliga',              region:'Germany',        flag:'🇩🇪', tier:'europe'  },
  { id:'dfb-pokal',       name:'DFB Pokal',                  region:'Germany',        flag:'🇩🇪', tier:'europe'  },
  { id:'serie-a',         name:'Serie A',                    region:'Italy',          flag:'🇮🇹', tier:'europe'  },
  { id:'serie-b',         name:'Serie B',                    region:'Italy',          flag:'🇮🇹', tier:'europe'  },
  { id:'coppa-italia',    name:'Coppa Italia',               region:'Italy',          flag:'🇮🇹', tier:'europe'  },
  { id:'ligue1',          name:'Ligue 1',                    region:'France',         flag:'🇫🇷', tier:'europe'  },
  { id:'ligue2',          name:'Ligue 2',                    region:'France',         flag:'🇫🇷', tier:'europe'  },
  { id:'coupe-france',    name:'Coupe de France',            region:'France',         flag:'🇫🇷', tier:'europe'  },

  // ── OTHER EUROPEAN LEAGUES ────────────────────────────────────────
  { id:'eredivisie',      name:'Eredivisie',                 region:'Netherlands',    flag:'🇳🇱', tier:'europe'  },
  { id:'pro-league',      name:'Belgian Pro League',         region:'Belgium',        flag:'🇧🇪', tier:'europe'  },
  { id:'primeira-liga',   name:'Primeira Liga',              region:'Portugal',       flag:'🇵🇹', tier:'europe'  },
  { id:'super-lig',       name:'Süper Lig',                  region:'Turkey',         flag:'🇹🇷', tier:'europe'  },
  { id:'scottish-prem',   name:'Scottish Premiership',       region:'Scotland',       flag:'🏴󠁧󠁢󠁳󠁣󠁴󠁿', tier:'europe'  },
  { id:'ekstraklasa',     name:'Ekstraklasa',                region:'Poland',         flag:'🇵🇱', tier:'europe'  },
  { id:'czech-liga',      name:'Czech First League',         region:'Czech Republic', flag:'🇨🇿', tier:'europe'  },
  { id:'greek-sl',        name:'Super League Greece',        region:'Greece',         flag:'🇬🇷', tier:'europe'  },
  { id:'rpfl',            name:'Russian Premier League',     region:'Russia',         flag:'🇷🇺', tier:'europe'  },
  { id:'allsvenskan',     name:'Allsvenskan',                region:'Sweden',         flag:'🇸🇪', tier:'europe'  },
  { id:'eliteserien',     name:'Eliteserien',                region:'Norway',         flag:'🇳🇴', tier:'europe'  },

  // ── AFRICA ───────────────────────────────────────────────────────
  { id:'afcon',           name:'AFCON',                      region:'Africa',         flag:'🌍', tier:'africa'  },
  { id:'afcon-qual',      name:'AFCON Qualifiers',           region:'Africa',         flag:'🌍', tier:'africa'  },
  { id:'caf-cl',          name:'CAF Champions League',       region:'Africa',         flag:'🌍', tier:'africa'  },
  { id:'caf-confed',      name:'CAF Confederation Cup',      region:'Africa',         flag:'🌍', tier:'africa'  },
  { id:'wafu-cup',        name:'WAFU Cup of Nations',        region:'West Africa',    flag:'🌍', tier:'africa'  },
  { id:'cecafa',          name:'CECAFA Cup',                 region:'East Africa',    flag:'🌍', tier:'africa'  },
  // East African leagues
  { id:'upl',             name:'Uganda Premier League',      region:'Uganda',         flag:'🇺🇬', tier:'local'   },
  { id:'ug-fa-cup',       name:'Uganda FA Cup',              region:'Uganda',         flag:'🇺🇬', tier:'local'   },
  { id:'kpl',             name:'Kenya Premier League',       region:'Kenya',          flag:'🇰🇪', tier:'local'   },
  { id:'ke-shield',       name:'FKF Shield Cup',             region:'Kenya',          flag:'🇰🇪', tier:'local'   },
  { id:'tpl',             name:'Tanzania Premier League',    region:'Tanzania',       flag:'🇹🇿', tier:'local'   },
  { id:'tz-cup',          name:'Tanzania FA Cup',            region:'Tanzania',       flag:'🇹🇿', tier:'local'   },
  { id:'rpl-rw',          name:'Rwanda Premier League',      region:'Rwanda',         flag:'🇷🇼', tier:'local'   },
  { id:'ethiopian-pl',    name:'Ethiopian Premier League',   region:'Ethiopia',       flag:'🇪🇹', tier:'local'   },
  // Other African leagues
  { id:'npfl',            name:'Nigeria Premier League',     region:'Nigeria',        flag:'🇳🇬', tier:'africa'  },
  { id:'psl',             name:'Premier Soccer League',      region:'South Africa',   flag:'🇿🇦', tier:'africa'  },
  { id:'gpl',             name:'Ghana Premier League',       region:'Ghana',          flag:'🇬🇭', tier:'africa'  },
  { id:'botola',          name:'Botola Pro',                 region:'Morocco',        flag:'🇲🇦', tier:'africa'  },
  { id:'ldc',             name:'Ligue Professionnelle 1',    region:'Algeria',        flag:'🇩🇿', tier:'africa'  },
  { id:'lnt',             name:'Ligue 1 Tunisie',            region:'Tunisia',        flag:'🇹🇳', tier:'africa'  },
  { id:'epl-eg',          name:'Egyptian Premier League',    region:'Egypt',          flag:'🇪🇬', tier:'africa'  },

  // ── AMERICAS ──────────────────────────────────────────────────────
  { id:'copa-america',    name:'Copa América',               region:'South America',  flag:'🌎', tier:'americas'},
  { id:'copa-lib',        name:'Copa Libertadores',          region:'South America',  flag:'🌎', tier:'americas'},
  { id:'copa-sud',        name:'Copa Sudamericana',          region:'South America',  flag:'🌎', tier:'americas'},
  { id:'brasileirao',     name:'Brasileirão Série A',        region:'Brazil',         flag:'🇧🇷', tier:'americas'},
  { id:'liga-mx',         name:'Liga MX',                    region:'Mexico',         flag:'🇲🇽', tier:'americas'},
  { id:'mls',             name:'MLS',                        region:'USA',            flag:'🇺🇸', tier:'americas'},
  { id:'arg-pl',          name:'Liga Profesional Argentina', region:'Argentina',      flag:'🇦🇷', tier:'americas'},
  { id:'concacaf-cl',     name:'CONCACAF Champions Cup',     region:'North America',  flag:'🌎', tier:'americas'},
  { id:'gold-cup',        name:'CONCACAF Gold Cup',          region:'North America',  flag:'🌎', tier:'americas'},

  // ── ASIA ──────────────────────────────────────────────────────────
  { id:'afc-cl',          name:'AFC Champions League',       region:'Asia',           flag:'🌏', tier:'asia'    },
  { id:'asian-cup',       name:'AFC Asian Cup',              region:'Asia',           flag:'🌏', tier:'asia'    },
  { id:'j-league',        name:'J1 League',                  region:'Japan',          flag:'🇯🇵', tier:'asia'    },
  { id:'k-league',        name:'K League 1',                 region:'South Korea',    flag:'🇰🇷', tier:'asia'    },
  { id:'csl',             name:'Chinese Super League',       region:'China',          flag:'🇨🇳', tier:'asia'    },
  { id:'isl',             name:'Indian Super League',        region:'India',          flag:'🇮🇳', tier:'asia'    },
  { id:'saudi-pl',        name:'Saudi Pro League',           region:'Saudi Arabia',   flag:'🇸🇦', tier:'asia'    },
  { id:'uae-pl',          name:'UAE Pro League',             region:'UAE',            flag:'🇦🇪', tier:'asia'    },
]

// Group by tier for UI display
export function getLeaguesByTier() {
  const grouped: Record<string, League[]> = {}
  LEAGUES.forEach(l => {
    if (!grouped[l.tier]) grouped[l.tier] = []
    grouped[l.tier].push(l)
  })
  return grouped
}

// Tier display labels
export const TIER_LABELS: Record<string, string> = {
  world:    '🌍 World',
  europe:   '🏆 Europe',
  africa:   '🌍 Africa',
  local:    '🇺🇬 East Africa',
  americas: '🌎 Americas',
  asia:     '🌏 Asia',
}

// Search leagues by name or region
export function searchLeagues(query: string): League[] {
  const q = query.toLowerCase()
  return LEAGUES.filter(l =>
    l.name.toLowerCase().includes(q) ||
    l.region.toLowerCase().includes(q) ||
    l.id.toLowerCase().includes(q)
  )
}

// Get league by id
export function getLeague(id: string): League | undefined {
  return LEAGUES.find(l => l.id === id)
}

// Filter chips for the main channels page
export const MAIN_FILTERS = [
  'All',
  'World Cup',
  'Champions League',
  'Premier League',
  'La Liga',
  'AFCON',
  'Uganda (UPL)',
  'Kenya (KPL)',
]
