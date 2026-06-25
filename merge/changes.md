# changes.md — manual tweaks during the merge

> **Status: PRE-MERGE (empty by design).** This log records every non-trivial manual
> change made while *performing* the merge (brief step **e**). The merge has **not**
> run yet — work to date is analysis only (steps a–d). Entries are appended here as
> the code merge proceeds on `stag`.

## Lineage recap
- `stag` is branched from **`dev/payments`** (code base); `main` is merged *into* it.
- Database baseline is **`main`'s DB**; `dev/payments` schema is layered on as appended
  additive, non-destructive migrations (real data preserved).
- Auth: **`dev/payments`' Supabase Auth only**; main's admin re-wired onto it.
- Settlement: **unified** — code-entered slips also settle via main's football API.

## Change log
_(none yet — populated during step e)_

| # | File(s) | Change | Why | Domain owner |
|---|---------|--------|-----|--------------|
| — | — | — | — | — |
