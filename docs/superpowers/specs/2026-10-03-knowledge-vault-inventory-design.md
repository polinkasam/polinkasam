# Knowledge Vault Inventory — Design

Date: 2026-10-03
Status: draft for review
Owner: pali (polinkasam)

## Purpose

Turn this Egregore into the single vault for everything pali has built: apps,
the website, product and spatial work, people, networks, finance tools and
decisions. The first deliverable is a trustworthy inventory in canonical
memory. Later work (website admin area, App Store pipeline, shared design
system) reads from this inventory and gets its own spec each.

Success looks like: any session can answer "what is the state of app X, where
is its code, who is involved, can it go to the App Store" from memory alone,
and pali can read and correct every file.

## What pali said (verbatim intent)

- Inventory first. Memory-first, one Markdown file per project.
- Alive apps: Saint Suaire (tarot, ex Arcana Echo), Leira (lyrics), KidyTalk,
  Cadence (Spanish poetry reader), Finance Dashboard, Project Circe.
- Whatever is on polinkasam.com is the latest reference and may be taken.
- No Apple Developer account. Germany, no business registered. Tax matters.
- Saint Suaire and the finance dashboard are pali's. Finance dashboard and
  Circe were built for Curve Labs but pali keeps them and wants the finance
  dashboard to become a product. Circe stays private, locked.
- The GPT-era operating layer in `~/projects` (board, agents, skills, local
  memory stack) was never used and is not preserved; mine it for true facts.
- Orphaned apps get private GitHub repos on `polinkasam`.
- The live site gets a real git repo; the accidental `~/.git` goes.
- The new Pixelhausen dashboard (other company, walled instance) is the
  reference for what pali wants for herself, "but better". Not copied.

## Facts established during discovery

| Fact | Evidence |
|---|---|
| polinkasam.com is a Next.js 15 app on Vercel | Vercel project `palina-portfolio`, folder `apps/portfolio-website/repos/palina-portfolio` |
| That folder has no git repo and no GitHub copy | `git rev-parse` resolves to `~`; `gh repo view polinkasam/palina-portfolio` → not found |
| `~` is an accidental git repo | tracks one file (`public/writings.html`), 5 commits Jun–Aug 2026, no remote |
| 25 nested repos have their own `.git` | unaffected by `~/.git` |
| Saint Suaire code | `apps/arcana-echo/repos/arcana-echo` (Vite, React 19, Supabase, Gemini). Art, brand, deck, print, Figma plugin in `~/SAINT SUAIRE/` |
| All former Curve Labs repos are already owned by `polinkasam` on GitHub | `gh api repos/palinaatcurvelabs/<name>` redirects to `polinkasam/<name>` |
| Four local clones still point at the old URL | arcana-echo, lexware-finance-dashboard, kineze-landing, personal-blog portfolio-site |
| Leira source is tangled with the Lab Derivative site | `apps/layra/repos/leira`: metadata says Lab Derivative; app code under `components/leira/` |
| KidyTalk source missing locally | prototype folder empty; GitHub `polinkasam/kidytalk`; Vercel `kidytalk-bilingual` |
| Cadence has a repo with one commit and no remote | `apps/cadence/repos/cadence` |
| Circe = 14-sheet finance/legal schema + Telegram bot + query UI | `~/Desktop/CLs/FIN/`, `circe-bot.js` |
| Ten Egregore instances on this Mac; seven are walled from this one | `~/.egregore/instances.json` |

## Vault structure (approved, section 1)

```
memory/
  projects/<slug>.md        one per project (apps, product, spatial, writing)
  people/<slug>.md          collaborators, friends, clients, networks
  knowledge/decisions/      dated decisions (Apple account, iOS path, ownership)
  knowledge/patterns/       reusable findings across apps
  infrastructure/           service registry: Vercel, Supabase, Hetzner, GitHub
  projects/index.md         generated table: slug, status, category, store candidate
```

### `memory/projects/<slug>.md` frontmatter

```yaml
---
slug: leira
title: Leira
category: app | product | spatial | writing | music | tool
status: alive | dormant | archived | idea
store_candidate: yes | later | no
store_path: capacitor | pwa | native | n/a | undecided
stack: [React, Vite, Supabase]
live_url: https://leira.vercel.app
vercel_project: leira
repo_local: apps/layra/repos/leira
repo_remote: https://github.com/polinkasam/<name>.git | none
backend: supabase | hetzner | none | google-sheets
collaborators: [people-slug]
last_touched: 2026-06-27
on_website: true
---
```

### Body sections

1. **What it is** — one paragraph, seeded from the site description.
2. **State of truth** — what the code actually does today, what is broken,
   what the site claims that the code does not deliver.
3. **Store path** — readiness notes: auth, offline behaviour, backend
   ownership, API keys exposed in client, PWA/Capacitor fit. Only for
   `store_candidate: yes | later`.
4. **Open threads** — unresolved questions, next steps, people waiting.

### `memory/people/<slug>.md`

Name, role, relationship to pali, projects involved, agreements (plain
words, dated), contact channel, last contact. No secrets, no private
documents. Sensitive legal or financial material stays on disk and is
referenced by path only.

## Import sequence (approved, section 2)

### Step 0 — repo hygiene (approved by pali)

| Action | Who | Notes |
|---|---|---|
| Repoint four local remotes to `github.com/polinkasam/...` | pali runs the four commands | Permission classifier blocked the agent; commands provided in session |
| Back up `~/.git` to the scratchpad and to `~/projects/other/home-git-backup-2026-10-03/`, then remove it | agent | history is 5 commits on one file; writings snapshot exists as `writings-full-backup.html` |
| `git init` inside `palina-portfolio`, first commit, push private `polinkasam/palina-portfolio` | agent | `.gitignore` already present; verify `node_modules` and `.next` ignored |
| Push `cadence` to private `polinkasam/cadence` | agent | |
| Push `finance-dashboard-demo` to private `polinkasam/finance-dashboard-demo` | agent | |
| Leira: record the tangle, do not split yet | agent | splitting is App Store pipeline work |

### Step 1 — seed from the website

Parse `lib/project-data.ts` in `palina-portfolio` (40 entries: apps, spatial,
product design, writing, music). Create one `memory/projects/<slug>.md` per
entry with title, description, stack, live URL, features and
`on_website: true`. Entries not on the site but present on disk get a file
with `on_website: false`.

### Step 2 — overlay code reality

For every folder under `~/projects/apps`, `~/projects/other`, and the
Vercel project list: fill `repo_local`, `repo_remote`, `vercel_project`,
`last_touched` (last commit or mtime), `backend`, and a one-line
runnability note (builds / runs / unknown). Mark walled Egregore instances
as `source: walled-instance` and skip their internals.

### Step 3 — store-readiness for the six alive apps

Saint Suaire, Leira, KidyTalk, Cadence, Finance Dashboard, Circe. For each:
auth model, offline behaviour, backend ownership and cost, API keys in client
bundle, dependency on browser-only APIs (speech recognition, Web Audio),
Capacitor or PWA fit. Output goes into the **Store path** section. No code
changes.

### Step 4 — people and networks interview

Structured questions (AskUserQuestion, 2–4 per batch) producing
`memory/people/*.md` and `memory/knowledge/*` for networks, collaborations
and agreements. Includes who wants to collaborate on which app and under
what terms.

### Step 5 — decisions

Write `memory/knowledge/decisions/`:
- `2026-10-xx-apple-developer-account.md` — options: individual account in
  pali's name with Kleinunternehmer registration; publishing under a friend's
  account; organization account later. Recommendation with tax reasoning for
  Germany. Decision recorded once pali chooses.
- `2026-10-xx-ios-path.md` — per-app wrap vs rebuild, recommended after
  Step 3.
- `2026-10-03-ownership-curve-labs-repos.md` — pali's statement of
  ownership of Saint Suaire, finance dashboard and Circe.

### Step 6 — index and handoff

Generate `memory/projects/index.md`. Write a handoff. `/save`.

## Out of scope (approved, section 3)

Each of these gets its own brainstorm → spec → plan:

- **A. Website admin area and master dashboard** — `admin.` route on
  polinkasam.com, Supabase schema (projects, milestones, people, links),
  Circe behind a lock, sync from memory.
- **B. App Store pipeline** — developer account enrollment, per-app
  Capacitor wrap or rebuild, Leira separation, KidyTalk source recovery,
  TestFlight, listings, pricing.
- **C. Shared design system** — tokens and components reused across Saint
  Suaire, Leira, Cadence, KidyTalk and the website.

## Constraints

- Canonical memory is Markdown in `memory/` (the `polinkasam-memory` repo).
  No database in this spec.
- Walled Egregore instances (pixelhausen, bureau-circe, curve labs, pale
  wind, arcana-echo's own instance, sensorial-interface, hexen, dip) are
  never read. Facts about them come from pali or from public surfaces.
- Company documents on the Desktop (court letters, tax notices, contracts)
  are not imported. Circe is referenced by path and described, not copied.
- No secrets in memory. Service registry lists where credentials live, not
  values.
- All GitHub repos created are private.

## Verification

- Every alive app has a project file whose `repo_remote` fetches and whose
  `live_url` returns 200.
- `bash bin/search.sh find "Leira transliteration"` returns the Leira file.
- `memory/projects/index.md` row count equals the number of project files.
- `git -C ~ rev-parse` fails after Step 0; `git -C palina-portfolio remote -v`
  shows `polinkasam/palina-portfolio`.
- pali reads at least the six alive-app files and corrects them before the
  handoff.

## Risks

- Site descriptions overstate what the code does. Step 2 marks the gap
  explicitly rather than trusting either side.
- KidyTalk source may only exist on GitHub or in an AI Studio export.
- Removing `~/.git` is irreversible without the backup; two backup copies are
  made before removal.
