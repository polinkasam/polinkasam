# Knowledge Vault Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a trustworthy inventory of every project, person, backend schema and decision in pali's world as Markdown files in the memory repo, seeded from the website and corrected against the code.

**Architecture:** Three small Node scripts under `tools/vault/` (seed from the site, scan code reality, generate the index) write and update frontmatter in `memory/projects/*.md`; everything else (store readiness, schema catalog, people, decisions) is authored by the agent into memory files following fixed templates. Repo hygiene is a user-run step because git operations on sibling repos are blocked from this worktree.

**Tech Stack:** Node 25 (built-in TypeScript type stripping, `node --test`), Bash, Python 3 with openpyxl (already installed), gh CLI, Egregore memory repo (`memory/` symlink to `../polinkasam-memory`).

**Spec:** `docs/superpowers/specs/2026-10-03-knowledge-vault-inventory-design.md`

## Global Constraints

- Canonical memory is Markdown under `memory/` only. No database.
- Never read inside a walled Egregore instance. The walled paths are the `path` values in `~/.egregore/instances.json` except `/Users/polinkasam/projects/polinkasam`. Today that is: `/Users/polinkasam/egregore`, `/Users/polinkasam/egregore/egregore-curve-labs`, `/Users/polinkasam/bureau-circe`, `/Users/polinkasam/cd polinkasa,/dip`, `/Users/polinkasam/i dunno whichone/hexen`, `/Users/polinkasam/sensorial-interface/sensorial-interface`, `/Users/polinkasam/projects/apps/arcana-echo/arcana-echo`, `/Users/polinkasam/pale wind/pale-wind`, `/Users/polinkasam/pixelhausen/pixelhausen`.
- Company documents on the Desktop are not imported. Circe is described and referenced by path only.
- No secrets in memory. `infrastructure/` lists where credentials live, never values.
- All GitHub repos created are private.
- Scripts live in `tools/vault/` (org-owned, outside framework-managed `bin/`).
- Scripts are idempotent: re-running never overwrites a body section a human edited. Only frontmatter fields the script owns are rewritten.
- Commit format: `type(scope): imperative summary`, with trailers `Egregore-Session: <contents of .egregore-session-id>` and `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- From this worktree, `git -C <other repo>` and compound git commands are blocked by the worktree hook. Git on sibling repos is done by pali with the `!` prefix; the agent verifies by reading `.git/config` and `.git/logs/HEAD` as plain files.

## Review Focus

1. **Re-running the seed after pali edited a body section** must keep her edits. Pinned in Task 2 by the "existing file keeps body" test.
2. **A site entry with `hidden: true`** must still get a file (it is a real project) but with `on_website: false`. Pinned in Task 2.
3. **A project folder that is a walled instance** (`apps/arcana-echo/arcana-echo`) must be skipped by the scanner and never opened, while its sibling `apps/arcana-echo/repos/arcana-echo` is scanned. Pinned in Task 3.
4. **Duplicate ids across the site's three arrays** (e.g. `kineze` appears in `projects` and in an archive category) must produce one file, not two. Pinned in Task 2.
5. **A folder with no package.json and no `.git`** (assets only, like `apps/kiddy-talk`) must appear in the scan as `runnable: unknown` rather than crash or be silently dropped. Pinned in Task 3.

---

### Task 1: Repo hygiene (user-run git, agent-verified)

**Files:**
- Create: `/Users/polinkasam/projects/other/home-git-backup-2026-10-08/` (copy of `~/.git`)
- Create: `/Users/polinkasam/projects/apps/portfolio-website/repos/palina-portfolio/.git`
- Modify: `/Users/polinkasam/projects/apps/portfolio-website/repos/palina-portfolio/.gitignore`
- Create: GitHub repos `polinkasam/palina-portfolio`, `polinkasam/cadence`, `polinkasam/finance-dashboard-demo` (private)

**Interfaces:**
- Produces: `repo_remote` values Task 3 will discover: `https://github.com/polinkasam/palina-portfolio.git`, `https://github.com/polinkasam/cadence.git`, `https://github.com/polinkasam/finance-dashboard-demo.git`.

- [ ] **Step 1: Back up the home-folder repo (agent, no git command)**

```bash
mkdir -p /Users/polinkasam/projects/other/home-git-backup-2026-10-08
cp -R /Users/polinkasam/.git /Users/polinkasam/projects/other/home-git-backup-2026-10-08/dot-git
cp -R /Users/polinkasam/.git "/private/tmp/claude-501/-Users-polinkasam-projects-polinkasam/e6a754a3-6d8d-4e73-9eea-99e97c60be87/scratchpad/home-dot-git-backup"
ls /Users/polinkasam/projects/other/home-git-backup-2026-10-08/dot-git/HEAD
```
Expected: `HEAD` listed in both copies.

- [ ] **Step 2: Remove the home-folder repo (agent)**

```bash
rm -rf /Users/polinkasam/.git
test -d /Users/polinkasam/.git && echo STILL_THERE || echo REMOVED
```
Expected: `REMOVED`.

- [ ] **Step 3: Check the website .gitignore covers build output (agent)**

```bash
cat /Users/polinkasam/projects/apps/portfolio-website/repos/palina-portfolio/.gitignore
```
If `node_modules`, `.next`, `.vercel`, `.env*`, `tsconfig.tsbuildinfo` are not all present, append the missing lines:

```bash
printf '%s\n' node_modules .next .vercel '.env*' tsconfig.tsbuildinfo >> /Users/polinkasam/projects/apps/portfolio-website/repos/palina-portfolio/.gitignore
sort -u -o /Users/polinkasam/projects/apps/portfolio-website/repos/palina-portfolio/.gitignore /Users/polinkasam/projects/apps/portfolio-website/repos/palina-portfolio/.gitignore
```

- [ ] **Step 4: Hand pali the git commands (user runs each with the `!` prefix)**

```
! cd /Users/polinkasam/projects/apps/portfolio-website/repos/palina-portfolio && git init -b main && git add -A && git commit -m "chore(site): initial commit of the live polinkasam.com source" && gh repo create polinkasam/palina-portfolio --private --source=. --remote=origin --push
! cd /Users/polinkasam/projects/apps/cadence/repos/cadence && gh repo create polinkasam/cadence --private --source=. --remote=origin --push
! cd /Users/polinkasam/projects/apps/finance-dashboard/repos/finance-dashboard-demo && git init -b main && git add -A && git commit -m "chore(finance-demo): initial commit" && gh repo create polinkasam/finance-dashboard-demo --private --source=. --remote=origin --push
```
Before the third command, check `finance-dashboard-demo` has a `.gitignore` with `node_modules`; if not, create one with that single line.

- [ ] **Step 5: Verify remotes as plain file reads (agent)**

```bash
grep url /Users/polinkasam/projects/apps/portfolio-website/repos/palina-portfolio/.git/config
grep url /Users/polinkasam/projects/apps/cadence/repos/cadence/.git/config
grep url /Users/polinkasam/projects/apps/finance-dashboard/repos/finance-dashboard-demo/.git/config
gh repo view polinkasam/palina-portfolio --json isPrivate --jq .isPrivate
```
Expected: three `url = https://github.com/polinkasam/...` lines, and `true`.

- [ ] **Step 6: Record Leira's tangle (agent)**

Write `memory/knowledge/findings/2026-10-08-leira-source-tangled-with-lab-derivative.md`:

```markdown
# Leira source is tangled with the Lab Derivative website

Date: 2026-10-08
Status: open

`apps/layra/repos/leira` is one folder holding two products. `metadata.json`
names "Lab Derivative" and the top-level components (Hero, Offerings, Team,
SemanticGraph3D, Lace) are that website. The Leira lyrics app lives under
`components/leira/` and is wired from `App.tsx`. The folder has no git repo
and no remote. Vercel project `leira` deploys from it.

Splitting is App Store pipeline work (follow-up spec B). Until then the
project file for Leira points at this folder and marks `repo_remote: none`.
```

- [ ] **Step 7: Commit the finding**

```bash
cd /Users/polinkasam/projects/polinkasam-memory && git add knowledge/findings/2026-10-08-leira-source-tangled-with-lab-derivative.md && git commit -q -m "docs(findings): record leira source tangle" && git log --oneline -1
```
Note: the memory repo is a separate repository; commits there are allowed. If the worktree hook refuses, pali runs it with `!`.

---

### Task 2: Seed project files from the website

**Files:**
- Create: `tools/vault/seed-projects.mjs`
- Create: `tools/vault/lib/frontmatter.mjs`
- Create: `tools/vault/lib/slug.mjs`
- Test: `tools/vault/tests/frontmatter.test.mjs`
- Test: `tools/vault/tests/seed-projects.test.mjs`
- Test fixture: `tools/vault/tests/fixtures/project-data.ts`
- Create: `memory/projects/<slug>.md` (one per site entry)

**Interfaces:**
- Produces `parseFrontmatter(text) → { data: object, body: string }` and `serialize(data, body) → string` in `lib/frontmatter.mjs`.
- Produces `toSlug(id) → string` in `lib/slug.mjs` (lowercase, `[^a-z0-9]+` → `-`, trimmed).
- Produces `seedProjects({ dataPath, outDir }) → { created: string[], skipped: string[] }` in `seed-projects.mjs`, also runnable as a CLI: `node tools/vault/seed-projects.mjs --data <path> --out memory/projects`.
- Frontmatter keys owned by the seed (rewritten on every run): `slug, title, category, on_website, live_url, stack, site_description, site_features`. All other keys and the body are preserved if the file exists.

- [ ] **Step 1: Write the failing frontmatter tests**

`tools/vault/tests/frontmatter.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFrontmatter, serialize } from "../lib/frontmatter.mjs";

test("parses yaml-ish frontmatter and body", () => {
  const text = `---\nslug: leira\nstack: [React, Vite]\non_website: true\n---\n\n## What it is\n\nLyrics app.\n`;
  const { data, body } = parseFrontmatter(text);
  assert.equal(data.slug, "leira");
  assert.deepEqual(data.stack, ["React", "Vite"]);
  assert.equal(data.on_website, true);
  assert.equal(body, "## What it is\n\nLyrics app.\n");
});

test("round-trips through serialize", () => {
  const data = { slug: "leira", stack: ["React", "Vite"], on_website: true, status: "alive" };
  const body = "## What it is\n\nLyrics app.\n";
  const { data: d2, body: b2 } = parseFrontmatter(serialize(data, body));
  assert.deepEqual(d2, data);
  assert.equal(b2, body);
});

test("returns empty data when no frontmatter", () => {
  const { data, body } = parseFrontmatter("# Just a title\n");
  assert.deepEqual(data, {});
  assert.equal(body, "# Just a title\n");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tools/vault/tests/frontmatter.test.mjs`
Expected: FAIL, cannot find module `../lib/frontmatter.mjs`.

- [ ] **Step 3: Implement frontmatter.mjs**

`tools/vault/lib/frontmatter.mjs`:
```js
// Minimal frontmatter: scalars (string, number, true/false), and flat arrays [a, b].
export function parseFrontmatter(text) {
  if (!text.startsWith("---\n")) return { data: {}, body: text };
  const end = text.indexOf("\n---\n", 4);
  if (end === -1) return { data: {}, body: text };
  const block = text.slice(4, end);
  let body = text.slice(end + 5);
  if (body.startsWith("\n")) body = body.slice(1);
  const data = {};
  for (const line of block.split("\n")) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (!m) continue;
    data[m[1]] = parseValue(m[2]);
  }
  return { data, body };
}

function parseValue(raw) {
  const v = raw.trim();
  if (v === "") return "";
  if (v === "true") return true;
  if (v === "false") return false;
  if (v.startsWith("[") && v.endsWith("]")) {
    const inner = v.slice(1, -1).trim();
    return inner === "" ? [] : inner.split(",").map((s) => unquote(s.trim()));
  }
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return unquote(v);
}

function unquote(s) {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1);
  return s;
}

function formatValue(v) {
  if (Array.isArray(v)) return `[${v.map(formatScalar).join(", ")}]`;
  return formatScalar(v);
}

function formatScalar(v) {
  if (typeof v === "boolean" || typeof v === "number") return String(v);
  const s = String(v);
  return /[:#\[\],"']/.test(s) || s !== s.trim() ? JSON.stringify(s) : s;
}

export function serialize(data, body) {
  const lines = Object.entries(data).map(([k, v]) => `${k}: ${formatValue(v)}`);
  return `---\n${lines.join("\n")}\n---\n\n${body}`;
}
```

- [ ] **Step 4: Run frontmatter tests**

Run: `node --test tools/vault/tests/frontmatter.test.mjs`
Expected: 3 passing.

- [ ] **Step 5: Write slug.mjs and the seed fixture**

`tools/vault/lib/slug.mjs`:
```js
export function toSlug(id) {
  return String(id).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
```

`tools/vault/tests/fixtures/project-data.ts` (mirrors the real file's three exports and the duplicate-id and hidden cases):
```ts
export const projects = [
  { id: "kineze", title: "Kinese", image: "/x.jpg", filter: "Spatial & Installation", tags: ["Pavilion"], height: 34 },
  { id: "writings", title: "Writings", image: "/w.jpg", filter: "Writing", tags: ["Poetry"], height: 28 },
];
export const cinematicFilmProjects = [
  { id: "aether-motion", title: "AETHER Motion", timestamp: "00:12", image: "/a.jpg" },
];
export const archiveIndexCategories = [
  {
    id: "apps-code",
    title: "APPS & CODE",
    projects: [
      { id: "leira", title: "Leira", description: "Song lyrics practice app.", image: "/l.png", href: "https://leira.vercel.app", kind: "app", stack: ["React", "Vite"], features: ["Transliteration"] },
      { id: "secret-tool", title: "Secret Tool", description: "Hidden one.", image: "/s.png", kind: "app", hidden: true },
    ],
  },
  {
    id: "spatial",
    title: "SPATIAL & INSTALLATION",
    projects: [
      { id: "kineze", title: "Kinese", description: "Interactive pavilion.", image: "/k.jpg", kind: "architecture", materials: ["Steel"] },
    ],
  },
];
```

- [ ] **Step 6: Write the failing seed tests**

`tools/vault/tests/seed-projects.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { seedProjects } from "../seed-projects.mjs";
import { parseFrontmatter } from "../lib/frontmatter.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, "fixtures", "project-data.ts");

test("creates one file per unique id with category and site fields", async () => {
  const out = mkdtempSync(join(tmpdir(), "vault-"));
  const result = await seedProjects({ dataPath: fixture, outDir: out });
  const files = readdirSync(out).sort();
  assert.deepEqual(files, ["aether-motion.md", "kineze.md", "leira.md", "secret-tool.md", "writings.md"]);
  const leira = parseFrontmatter(readFileSync(join(out, "leira.md"), "utf8"));
  assert.equal(leira.data.title, "Leira");
  assert.equal(leira.data.category, "app");
  assert.equal(leira.data.live_url, "https://leira.vercel.app");
  assert.deepEqual(leira.data.stack, ["React", "Vite"]);
  assert.equal(leira.data.on_website, true);
  assert.equal(leira.data.status, "unknown");
  assert.match(leira.body, /## What it is\n\nSong lyrics practice app\./);
  assert.match(leira.body, /## State of truth/);
  assert.match(leira.body, /## Store path/);
  assert.match(leira.body, /## Open threads/);
  assert.equal(result.created.length, 5);
});

test("duplicate id across arrays yields one file with the archive description", async () => {
  const out = mkdtempSync(join(tmpdir(), "vault-"));
  await seedProjects({ dataPath: fixture, outDir: out });
  const k = parseFrontmatter(readFileSync(join(out, "kineze.md"), "utf8"));
  assert.equal(k.data.category, "spatial");
  assert.match(k.body, /Interactive pavilion\./);
});

test("hidden entries are files with on_website false", async () => {
  const out = mkdtempSync(join(tmpdir(), "vault-"));
  await seedProjects({ dataPath: fixture, outDir: out });
  const s = parseFrontmatter(readFileSync(join(out, "secret-tool.md"), "utf8"));
  assert.equal(s.data.on_website, false);
});

test("existing file keeps human-edited body and foreign keys, refreshes seed keys", async () => {
  const out = mkdtempSync(join(tmpdir(), "vault-"));
  await seedProjects({ dataPath: fixture, outDir: out });
  const p = join(out, "leira.md");
  writeFileSync(p, `---\nslug: leira\ntitle: Old Title\nstatus: alive\nrepo_local: apps/layra/repos/leira\n---\n\n## What it is\n\nPali edited this.\n`);
  const result = await seedProjects({ dataPath: fixture, outDir: out });
  const l = parseFrontmatter(readFileSync(p, "utf8"));
  assert.equal(l.data.title, "Leira");
  assert.equal(l.data.status, "alive");
  assert.equal(l.data.repo_local, "apps/layra/repos/leira");
  assert.equal(l.body, "## What it is\n\nPali edited this.\n");
  assert.equal(result.skipped.length, 5);
  assert.equal(result.created.length, 0);
});
```

- [ ] **Step 7: Run to verify it fails**

Run: `node --test tools/vault/tests/seed-projects.test.mjs`
Expected: FAIL, cannot find module `../seed-projects.mjs`.

- [ ] **Step 8: Implement seed-projects.mjs**

```js
#!/usr/bin/env node
// Seed memory/projects/<slug>.md from the website's lib/project-data.ts.
// Node 25 strips TypeScript types on import, so the .ts file loads directly.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseFrontmatter, serialize } from "./lib/frontmatter.mjs";
import { toSlug } from "./lib/slug.mjs";

const SEED_KEYS = ["slug", "title", "category", "on_website", "live_url", "stack", "site_description", "site_features"];

const CATEGORY_BY_ARCHIVE = {
  "apps-code": "app", "apps": "app",
  "spatial": "spatial", "spatial-installation": "spatial",
  "product-design": "product",
  "writing": "writing", "writings": "writing",
  "music": "music",
};
const CATEGORY_BY_FILTER = {
  "Apps & Code": "app", "UX/UI Design": "app", "Spatial & Installation": "spatial",
  "Product Design": "product", "3D & Visual Stories": "visual", "Art Direction": "visual",
  "Photography": "visual", "Writing": "writing",
};
const CATEGORY_BY_KIND = { app: "app", architecture: "spatial", design: "product", visual: "visual", photography: "visual" };

export function categoryFor(entry, archiveCategoryId) {
  if (entry.kind && CATEGORY_BY_KIND[entry.kind]) return CATEGORY_BY_KIND[entry.kind];
  if (archiveCategoryId) {
    const key = toSlug(archiveCategoryId);
    for (const [k, v] of Object.entries(CATEGORY_BY_ARCHIVE)) if (key.includes(k)) return v;
  }
  if (entry.filter && CATEGORY_BY_FILTER[entry.filter]) return CATEGORY_BY_FILTER[entry.filter];
  if (entry.timestamp) return "visual";
  return "unknown";
}

export async function loadSiteEntries(dataPath) {
  const mod = await import(pathToFileURL(resolve(dataPath)).href);
  const merged = new Map();
  const put = (entry, cat) => {
    const slug = toSlug(entry.id);
    const prev = merged.get(slug) || {};
    // Archive entries carry descriptions; they win over the grid/film stubs.
    const richer = entry.description ? { ...prev, ...entry } : { ...entry, ...prev };
    richer.__category = entry.description ? categoryFor(entry, cat) : (prev.__category || categoryFor(entry, cat));
    merged.set(slug, richer);
  };
  for (const e of mod.projects || []) put(e, null);
  for (const e of mod.cinematicFilmProjects || []) put(e, null);
  for (const c of mod.archiveIndexCategories || []) for (const e of c.projects || []) put(e, c.id);
  return merged;
}

function bodyFor(entry) {
  const what = entry.description || entry.body?.split("\n")[0] || "(no description on the site)";
  const features = (entry.features || []).map((f) => `- ${f}`).join("\n");
  return [
    "## What it is", "", what, "",
    ...(features ? ["Site-listed features:", "", features, ""] : []),
    "## State of truth", "", "_Not yet checked against the code._", "",
    "## Store path", "", "_Not assessed._", "",
    "## Open threads", "", "- [ ] Confirm status with pali", "",
  ].join("\n");
}

export async function seedProjects({ dataPath, outDir }) {
  mkdirSync(outDir, { recursive: true });
  const entries = await loadSiteEntries(dataPath);
  const created = [], skipped = [];
  for (const [slug, e] of entries) {
    const seed = {
      slug,
      title: e.title,
      category: e.__category,
      on_website: e.hidden ? false : true,
      live_url: e.href || "",
      stack: e.stack || [],
      site_description: e.description || "",
      site_features: e.features || [],
    };
    const file = join(outDir, `${slug}.md`);
    if (existsSync(file)) {
      const { data, body } = parseFrontmatter(readFileSync(file, "utf8"));
      const next = { ...data };
      for (const k of SEED_KEYS) next[k] = seed[k];
      writeFileSync(file, serialize(next, body));
      skipped.push(slug);
    } else {
      const data = { ...seed, status: "unknown", store_candidate: "no", store_path: "undecided", backend: "unknown",
        repo_local: "", repo_remote: "", vercel_project: "", collaborators: [], last_touched: "" };
      writeFileSync(file, serialize(data, bodyFor(e)));
      created.push(slug);
    }
  }
  return { created, skipped };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith("--") ? [a.slice(2), arr[i + 1]] : []).filter(Boolean));
  const result = await seedProjects({ dataPath: args.data, outDir: args.out });
  console.log(`created ${result.created.length}, refreshed ${result.skipped.length}`);
}
```

- [ ] **Step 9: Run all vault tests**

Run: `node --test tools/vault/tests/`
Expected: 7 passing.

- [ ] **Step 10: Run the seed against the real site data**

```bash
node tools/vault/seed-projects.mjs --data /Users/polinkasam/projects/apps/portfolio-website/repos/palina-portfolio/lib/project-data.ts --out memory/projects
ls memory/projects | wc -l
head -20 memory/projects/leira.md
```
Expected: roughly 40 files (60 ids in the file minus duplicates). Leira's file shows `category: app`, `live_url: https://leira.vercel.app`, and the four body headings.

- [ ] **Step 11: Commit scripts here, project files in the memory repo**

```bash
git add tools/vault && git commit -q -m "feat(vault): seed project files from the website data" && git log --oneline -1
```
Then pali or the agent commits the memory repo (`cd /Users/polinkasam/projects/polinkasam-memory && git add projects && git commit -q -m "docs(projects): seed project files from polinkasam.com"`).

---

### Task 3: Overlay code reality

**Files:**
- Create: `tools/vault/scan-code.mjs`
- Create: `tools/vault/mapping.json`
- Create: `tools/vault/apply-scan.mjs`
- Test: `tools/vault/tests/scan-code.test.mjs`
- Test fixture: `tools/vault/tests/fixtures/apps/` (built by the test)
- Modify: `memory/projects/*.md` (frontmatter only)

**Interfaces:**
- Consumes `parseFrontmatter`, `serialize` from Task 2.
- Produces `scanFolders({ roots, walled }) → ScanRecord[]` where `ScanRecord = { folder, package_name, framework, repo_remote, vercel_project, last_touched, backend, runnable }`.
- Produces `applyScan({ records, mapping, projectsDir }) → { updated: string[], unmapped: string[] }`. Keys owned by the scan (rewritten on every run): `repo_local, repo_remote, vercel_project, last_touched, backend, stack` (stack only when package.json found).
- `mapping.json` maps project slug → folder relative to `/Users/polinkasam/projects`.

- [ ] **Step 1: Write the failing scanner tests**

`tools/vault/tests/scan-code.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanFolders, detectBackend, detectFramework } from "../scan-code.mjs";

function makeTree() {
  const root = mkdtempSync(join(tmpdir(), "scan-"));
  // a real app with git, vercel, supabase
  const app = join(root, "apps", "leira", "repos", "leira");
  mkdirSync(join(app, ".git"), { recursive: true });
  mkdirSync(join(app, ".git", "logs"), { recursive: true });
  writeFileSync(join(app, ".git", "config"), '[remote "origin"]\n\turl = https://github.com/polinkasam/leira.git\n');
  writeFileSync(join(app, ".git", "logs", "HEAD"), "0 1 a <a@b> 1750000000 +0200\tcommit: x\n0 1 a <a@b> 1751000000 +0200\tcommit: y\n");
  mkdirSync(join(app, ".vercel"));
  writeFileSync(join(app, ".vercel", "project.json"), '{"projectName":"leira"}');
  writeFileSync(join(app, "package.json"), JSON.stringify({ name: "leira", dependencies: { react: "1", vite: "1", "@supabase/supabase-js": "1" } }));
  // a walled instance beside it
  const walled = join(root, "apps", "leira", "leira-instance");
  mkdirSync(walled, { recursive: true });
  writeFileSync(join(walled, "egregore.json"), "{}");
  writeFileSync(join(walled, "package.json"), "{}");
  // assets-only folder
  mkdirSync(join(root, "apps", "kiddy-talk"), { recursive: true });
  writeFileSync(join(root, "apps", "kiddy-talk", "cover.png"), "");
  return { root, walled };
}

test("scans app folders and reads remote, vercel, last commit, backend", async () => {
  const { root, walled } = makeTree();
  const records = await scanFolders({ roots: [join(root, "apps")], walled: [walled] });
  const leira = records.find((r) => r.folder.endsWith("repos/leira"));
  assert.ok(leira);
  assert.equal(leira.repo_remote, "https://github.com/polinkasam/leira.git");
  assert.equal(leira.vercel_project, "leira");
  assert.equal(leira.last_touched, "2025-06-27");
  assert.equal(leira.backend, "supabase");
  assert.equal(leira.framework, "vite-react");
  assert.equal(leira.runnable, "has-package-json");
});

test("never descends into a walled instance", async () => {
  const { root, walled } = makeTree();
  const records = await scanFolders({ roots: [join(root, "apps")], walled: [walled] });
  assert.equal(records.some((r) => r.folder.startsWith(walled)), false);
});

test("assets-only folder is recorded as runnable unknown", async () => {
  const { root, walled } = makeTree();
  const records = await scanFolders({ roots: [join(root, "apps")], walled: [walled] });
  const k = records.find((r) => r.folder.endsWith("kiddy-talk"));
  assert.ok(k);
  assert.equal(k.runnable, "unknown");
  assert.equal(k.repo_remote, "none");
});

test("backend and framework detection", () => {
  assert.equal(detectBackend({ dependencies: { "@prisma/client": "1" } }), "prisma-postgres");
  assert.equal(detectBackend({ dependencies: { "@supabase/supabase-js": "1" } }), "supabase");
  assert.equal(detectBackend({ dependencies: {} }), "none");
  assert.equal(detectFramework({ dependencies: { next: "1" } }), "next");
  assert.equal(detectFramework({ dependencies: { vite: "1", react: "1" } }), "vite-react");
  assert.equal(detectFramework({ dependencies: {} }), "unknown");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tools/vault/tests/scan-code.test.mjs`
Expected: FAIL, cannot find module `../scan-code.mjs`.

- [ ] **Step 3: Implement scan-code.mjs**

```js
#!/usr/bin/env node
// Walk project roots, record code reality per folder. Reads .git/config and
// .git/logs/HEAD as plain files so no git command runs (the worktree hook
// blocks git on sibling repos).
import { readdirSync, readFileSync, existsSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "build", ".git", ".claude", "__pycache__"]);
const MAX_DEPTH = 4;

export function detectBackend(pkg) {
  const d = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  if (d["@prisma/client"] || d.prisma) return "prisma-postgres";
  if (d["@supabase/supabase-js"]) return "supabase";
  if (d.neo4j || d["neo4j-driver"]) return "neo4j";
  return "none";
}

export function detectFramework(pkg) {
  const d = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  if (d.next) return "next";
  if (d.vite && d.react) return "vite-react";
  if (d.vite) return "vite";
  if (d.expo || d["react-native"]) return "react-native";
  return "unknown";
}

function readRemote(folder) {
  const cfg = join(folder, ".git", "config");
  if (!existsSync(cfg)) return "none";
  const m = readFileSync(cfg, "utf8").match(/\[remote "origin"\][^[]*?url\s*=\s*(\S+)/);
  return m ? m[1] : "none";
}

function readLastCommitDate(folder) {
  const log = join(folder, ".git", "logs", "HEAD");
  if (!existsSync(log)) return "";
  const lines = readFileSync(log, "utf8").trim().split("\n");
  const last = lines[lines.length - 1];
  const m = last.match(/>\s(\d{9,11})\s[+-]\d{4}\t/);
  return m ? new Date(Number(m[1]) * 1000).toISOString().slice(0, 10) : "";
}

function readVercel(folder) {
  const p = join(folder, ".vercel", "project.json");
  if (!existsSync(p)) return "";
  try { return JSON.parse(readFileSync(p, "utf8")).projectName || ""; } catch { return ""; }
}

function isWalled(folder, walled) {
  return walled.some((w) => folder === w || folder.startsWith(w + "/"));
}

function isProjectFolder(folder) {
  return existsSync(join(folder, "package.json")) || existsSync(join(folder, ".git")) || existsSync(join(folder, "requirements.txt")) || existsSync(join(folder, "index.html"));
}

function record(folder) {
  const pkgPath = join(folder, "package.json");
  let pkg = null;
  if (existsSync(pkgPath)) { try { pkg = JSON.parse(readFileSync(pkgPath, "utf8")); } catch { pkg = null; } }
  const mtime = statSync(folder).mtime.toISOString().slice(0, 10);
  return {
    folder,
    package_name: pkg?.name || "",
    framework: pkg ? detectFramework(pkg) : (existsSync(join(folder, "requirements.txt")) ? "python" : existsSync(join(folder, "index.html")) ? "static-html" : "unknown"),
    repo_remote: readRemote(folder),
    vercel_project: readVercel(folder),
    last_touched: readLastCommitDate(folder) || mtime,
    backend: pkg ? detectBackend(pkg) : "unknown",
    runnable: pkg ? "has-package-json" : existsSync(join(folder, "requirements.txt")) ? "python" : "unknown",
    stack: pkg ? Object.keys(pkg.dependencies || {}).filter((k) => ["react", "next", "vite", "three", "@supabase/supabase-js", "@prisma/client", "framer-motion", "tailwindcss"].includes(k)) : [],
  };
}

export async function scanFolders({ roots, walled }) {
  const out = [];
  function walk(folder, depth) {
    if (isWalled(folder, walled)) return;
    if (isProjectFolder(folder)) { out.push(record(folder)); return; }
    if (depth >= MAX_DEPTH) return;
    let kids = [];
    try { kids = readdirSync(folder, { withFileTypes: true }); } catch { return; }
    const subdirs = kids.filter((k) => k.isDirectory() && !SKIP_DIRS.has(k.name));
    if (subdirs.length === 0 && depth > 0) { out.push({ ...record(folder), runnable: "unknown" }); return; }
    for (const k of subdirs) walk(join(folder, k.name), depth + 1);
  }
  for (const r of roots) walk(resolve(r), 0);
  return out;
}

export function walledFromInstances(instancesPath, selfPath) {
  const list = JSON.parse(readFileSync(instancesPath, "utf8"));
  return list.map((i) => i.path).filter((p) => p !== selfPath);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const walled = walledFromInstances(`${process.env.HOME}/.egregore/instances.json`, "/Users/polinkasam/projects/polinkasam");
  const records = await scanFolders({ roots: ["/Users/polinkasam/projects/apps", "/Users/polinkasam/projects/other"], walled });
  writeFileSync("tools/vault/out/scan.json", JSON.stringify(records, null, 2));
  console.log(`scanned ${records.length} folders`);
}
```
Note on the kiddy-talk test: the folder has no package.json and no subdirectories, so the `subdirs.length === 0 && depth > 0` branch records it with `runnable: "unknown"`. The walled sibling is pruned before anything under it is read.

- [ ] **Step 4: Run scanner tests**

Run: `node --test tools/vault/tests/scan-code.test.mjs`
Expected: 4 passing.

- [ ] **Step 5: Write mapping.json**

`tools/vault/mapping.json` (slug → folder under `/Users/polinkasam/projects`; slugs must match the files Task 2 created; check with `ls memory/projects`):
```json
{
  "arcana-echo": "apps/arcana-echo/repos/arcana-echo",
  "leira": "apps/layra/repos/leira",
  "kiddy-talk": "apps/kiddy-talk",
  "cadence": "apps/cadence/repos/cadence",
  "finance-dashboard": "apps/finance-dashboard/repos/lexware-finance-dashboard",
  "grant-world": "other/grant-world",
  "social-media-kit": "apps/social-media-kit",
  "watch-my-dreams": "apps/watch-my-dreams",
  "kineze": "apps/kineze/repos/kineze-landing",
  "amphibian-records": "apps/amphibian-records",
  "deep-insight": "apps/deep-insight",
  "ion": "apps/i-o-n",
  "writings": "apps/portfolio-website/repos/palina-portfolio",
  "personal-blog": "apps/personal-blog-polinka/repos/portfolio-site",
  "pale-wind": "apps/pale-wind",
  "vocal-notebook": "apps/singing/vocal-notebook",
  "angelic": "apps/angelic",
  "circe-product": "apps/circe-product"
}
```
Slugs here that have no file in `memory/projects/` yet (pale-wind, vocal-notebook, angelic, circe-product, personal-blog) get one created by `apply-scan` with `on_website: false`. Adjust slug names after running `ls memory/projects`; the site ids are the source of truth for slugs.

- [ ] **Step 6: Implement apply-scan.mjs**

```js
#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseFrontmatter, serialize } from "./lib/frontmatter.mjs";

const SCAN_KEYS = ["repo_local", "repo_remote", "vercel_project", "last_touched", "backend"];
const ROOT = "/Users/polinkasam/projects";

export function applyScan({ records, mapping, projectsDir }) {
  const byFolder = new Map(records.map((r) => [r.folder, r]));
  const updated = [], unmapped = [];
  for (const [slug, rel] of Object.entries(mapping)) {
    const rec = byFolder.get(join(ROOT, rel));
    if (!rec) { unmapped.push(slug); continue; }
    const file = join(projectsDir, `${slug}.md`);
    let data = {}, body = "";
    if (existsSync(file)) ({ data, body } = parseFrontmatter(readFileSync(file, "utf8")));
    else {
      data = { slug, title: slug, category: "unknown", on_website: false, status: "unknown", store_candidate: "no", store_path: "undecided", collaborators: [] };
      body = "## What it is\n\n_Found on disk, not on the site._\n\n## State of truth\n\n_Not yet checked._\n\n## Store path\n\n_Not assessed._\n\n## Open threads\n\n- [ ] Confirm with pali\n";
    }
    data.repo_local = rel;
    data.repo_remote = rec.repo_remote;
    data.vercel_project = rec.vercel_project;
    data.last_touched = rec.last_touched;
    data.backend = rec.backend;
    if (rec.stack.length) data.stack = rec.stack;
    writeFileSync(file, serialize(data, body));
    updated.push(slug);
  }
  const mappedFolders = new Set(Object.values(mapping).map((rel) => join(ROOT, rel)));
  const orphans = records.filter((r) => !mappedFolders.has(r.folder)).map((r) => r.folder);
  return { updated, unmapped, orphans };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const records = JSON.parse(readFileSync("tools/vault/out/scan.json", "utf8"));
  const mapping = JSON.parse(readFileSync("tools/vault/mapping.json", "utf8"));
  const r = applyScan({ records, mapping, projectsDir: "memory/projects" });
  console.log(`updated ${r.updated.length}; unmapped slugs: ${r.unmapped.join(", ") || "none"}`);
  console.log("folders with no slug (decide: add to mapping or ignore):\n" + r.orphans.join("\n"));
}
```

- [ ] **Step 7: Run scan and apply against the real tree**

```bash
mkdir -p tools/vault/out && echo 'out/' >> tools/vault/.gitignore
node tools/vault/scan-code.mjs
node tools/vault/apply-scan.mjs
grep -l "repo_remote: none" memory/projects/*.md
```
Expected: scan count around 25 to 35 folders; no path under a walled instance appears in `tools/vault/out/scan.json` (check: `grep -c "arcana-echo/arcana-echo\"" tools/vault/out/scan.json` → 0). Orphan folders are either added to `mapping.json` or listed in the handoff as ignored.

- [ ] **Step 8: Hand-write State of truth for the six alive apps**

For each of `arcana-echo`, `leira`, `kiddy-talk`, `cadence`, `finance-dashboard`, `grant-world` (Circe), replace the `## State of truth` placeholder with 3 to 8 sentences built from these checks, run as plain reads:

```bash
# what the app actually imports and calls
grep -rhoE "from ['\"]@?[a-z0-9@/._-]+['\"]" <folder>/App.tsx <folder>/components 2>/dev/null | sort | uniq -c | sort -rn | head -15
# routes / API surface
ls <folder>/app/api <folder>/pages/api <folder>/services <folder>/lib 2>/dev/null
# does it build? (allowed: not a git command)
cd <folder> && npm run build 2>&1 | tail -5
```
Write what the site claims that the code does not deliver as its own sentence starting "The site says ... the code ...". For Finance Dashboard, name the integrations present in code (`ls <folder>/app/api`) and mark each `works | broken | unknown` from pali's answer in Task 6.

Also set `status: alive` on these six and `status: dormant` on everything else with a `repo_local`, `status: archived` on site entries with no code.

- [ ] **Step 9: Run all tests, commit**

Run: `node --test tools/vault/tests/` → 11 passing.
```bash
git add tools/vault && git commit -q -m "feat(vault): scan code reality and apply it to project files" && git log --oneline -1
```
Memory repo: `git add projects && git commit -q -m "docs(projects): overlay code reality on project files"`.

---

### Task 4: Store readiness for the six alive apps

**Files:**
- Modify: `memory/projects/{arcana-echo,leira,kiddy-talk,cadence,finance-dashboard,grant-world}.md` (the `## Store path` section and `store_candidate`, `store_path` fields)
- Create: `memory/knowledge/findings/2026-10-08-store-readiness.md`

**Interfaces:**
- Consumes the project files from Task 3.
- Produces `store_candidate` and `store_path` values Task 7's iOS decision reads.

- [ ] **Step 1: Run the readiness probes per app (plain reads, no git)**

For each folder `F` from `mapping.json`:
```bash
# secrets or keys shipped to the browser
grep -rnoE "(VITE_|NEXT_PUBLIC_)[A-Z0-9_]*(KEY|SECRET|TOKEN)[A-Z0-9_]*" F --include=*.ts --include=*.tsx --include=*.js --exclude-dir=node_modules | head
grep -rnoE "AIza[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{30,}" F --include=*.ts --include=*.tsx --include=*.js --include=*.html --exclude-dir=node_modules --exclude-dir=dist | head
# browser-only APIs that a native wrapper must handle
grep -rlnE "SpeechRecognition|webkitSpeechRecognition|AudioContext|navigator\.mediaDevices|localStorage" F --include=*.ts --include=*.tsx --include=*.js --exclude-dir=node_modules | head
# auth model
grep -rlnE "supabase\.auth|signInWith|onAuthStateChange" F --include=*.ts --include=*.tsx --exclude-dir=node_modules | head
# external services
grep -rhoE "https://[a-z0-9.-]+\.(com|net|io|dev|app)" F --include=*.ts --include=*.tsx --include=*.js --exclude-dir=node_modules --exclude-dir=dist | sort -u | head -20
```
KidyTalk has no local source: run the probes after `gh repo clone polinkasam/kidytalk /private/tmp/claude-501/-Users-polinkasam-projects-polinkasam/e6a754a3-6d8d-4e73-9eea-99e97c60be87/scratchpad/kidytalk` (pali runs it with `!` if the hook blocks the clone).

- [ ] **Step 2: Fill each `## Store path` section with this exact structure**

```markdown
## Store path

- Auth: none | Supabase email | Supabase OAuth
- Offline: works | partial (what breaks) | needs network
- Backend ownership: who pays, which account, monthly cost if known
- Keys in client: none found | list (file:line), must move server-side before store
- Browser-only APIs: list, and whether Capacitor plugins cover them
- Fit: capacitor | pwa | native | not-a-mobile-app
- Blockers before submission: numbered list
- Verdict: store_candidate yes|later|no, because ...
```
Set the frontmatter `store_candidate` and `store_path` to match the verdict. Expected verdicts to challenge, not assume: Leira capacitor yes; Cadence capacitor yes; Saint Suaire capacitor yes with the Gemini key moved server-side; KidyTalk capacitor later (speech recognition needs the native plugin); Finance Dashboard not-a-mobile-app, it is a web product; Circe no, internal tool.

- [ ] **Step 3: Write the cross-app finding**

`memory/knowledge/findings/2026-10-08-store-readiness.md`: a table with one row per app (columns: app, fit, blockers count, keys in client yes/no, verdict), then three sentences on what the six share (for example: all client-side Supabase, all Vite, two expose keys).

- [ ] **Step 4: Commit in the memory repo**

```bash
git add projects knowledge/findings && git commit -q -m "docs(projects): store readiness for the six alive apps"
```

---

### Task 5: Catalog the backend schemas

**Files:**
- Create: `tools/vault/extract-schemas.py`
- Create: `memory/knowledge/patterns/relational-schema-kit.md`
- Create: `memory/infrastructure/services.md`

**Interfaces:**
- Produces the catalog file follow-up spec D reads.

- [ ] **Step 1: Write the extractor (Python, reads only)**

`tools/vault/extract-schemas.py`:
```python
#!/usr/bin/env python3
"""Print table/column inventories for every schema source as Markdown."""
import re, sys, json
from pathlib import Path

def circe_xlsx(path):
    import openpyxl
    wb = openpyxl.load_workbook(path, read_only=True)
    out = []
    for name in wb.sheetnames:
        ws = wb[name]
        header = next(ws.iter_rows(min_row=1, max_row=1, values_only=True), ())
        cols = [str(c) for c in header if c is not None]
        out.append((name, cols))
    return out

def prisma(path):
    text = Path(path).read_text()
    models = re.findall(r"model\s+(\w+)\s*\{([^}]*)\}", text)
    out = []
    for name, body in models:
        cols = [l.split()[0] for l in body.strip().splitlines() if l.strip() and not l.strip().startswith(("@@", "//"))]
        out.append((name, cols))
    return out

def sql(path):
    text = Path(path).read_text()
    tables = re.findall(r"create table\s+(?:if not exists\s+)?[\"`]?(?:\w+\.)?(\w+)[\"`]?\s*\(([^;]*?)\);", text, re.I | re.S)
    out = []
    for name, body in tables:
        cols = [l.strip().split()[0].strip('",`') for l in body.splitlines() if l.strip() and not l.strip().lower().startswith(("primary", "foreign", "constraint", "unique", "check", "--"))]
        out.append((name, cols))
    return out

def md(title, source, tables):
    lines = [f"### {title}", "", f"Source: `{source}`", "", "| Table | Columns |", "| --- | --- |"]
    for name, cols in tables:
        lines.append(f"| {name} | {', '.join(cols)} |")
    return "\n".join(lines) + "\n"

if __name__ == "__main__":
    sources = {
        "Circe operations schema": ("/Users/polinkasam/Desktop/CLs/FIN/Circe.xlsx", circe_xlsx),
        "Finance Dashboard (Prisma)": ("/Users/polinkasam/projects/apps/finance-dashboard/repos/lexware-finance-dashboard/prisma/schema.prisma", prisma),
        "Saint Suaire (Supabase)": ("/Users/polinkasam/projects/apps/arcana-echo/repos/arcana-echo/supabase-schema.sql", sql),
        "Leira (Supabase)": ("/Users/polinkasam/projects/apps/layra/repos/leira/supabase/schema.sql", sql),
    }
    for title, (path, fn) in sources.items():
        if not Path(path).exists():
            print(f"### {title}\n\nSource missing: `{path}`\n")
            continue
        print(md(title, path, fn(path)))
```

- [ ] **Step 2: Run it and check every source is found**

Run: `python3 tools/vault/extract-schemas.py > /private/tmp/claude-501/-Users-polinkasam-projects-polinkasam/e6a754a3-6d8d-4e73-9eea-99e97c60be87/scratchpad/schemas.md && grep -c "Source missing" /private/tmp/claude-501/-Users-polinkasam-projects-polinkasam/e6a754a3-6d8d-4e73-9eea-99e97c60be87/scratchpad/schemas.md`
Expected: `0`. If the Prisma path differs, find it with `ls <folder>/prisma`. Watch My Dreams has no SQL file: inspect `apps/watch-my-dreams` by hand and write its node and relationship types from the FastAPI models.

- [ ] **Step 3: Write the catalog**

`memory/knowledge/patterns/relational-schema-kit.md`, exact structure:
```markdown
# Relational schema kit: every backend pali has designed

Date: 2026-10-08
Status: catalog (follow-up spec D turns it into a kit)

## Why this exists
Two sentences: pali has designed the same kind of operations backend four
times; the next dashboard should start from one of them, not from zero.

## Schemas
(paste the extractor output here, one subsection per schema, then under
each table add two lines: "Powered:" what feature used it, "Lesson:" what
worked or broke)

## Pixelhausen dashboard (described by pali, not read)
Bullet list from pali's answers in Task 6.

## What they share
A table: concept (company, account, person, project, transaction, grant,
contract, milestone) × which schemas have it. Then the three design rules
that recur (strict foreign keys, flat relational over graph, a single
natural-language query layer on top).

## What broke
One line per failed integration from the Finance Dashboard with the
reason, from Task 3 step 8 and pali's answer.
```

- [ ] **Step 4: Write the service registry**

`memory/infrastructure/services.md`:
```markdown
# Services

| Service | Account | Used by | Credentials live in |
| --- | --- | --- | --- |
| Vercel | team polinkasams-projects | all deployed apps | Vercel CLI login on this Mac |
| GitHub | polinkasam (plus legacy palinaatcurvelabs login in gh) | all repos | gh keyring |
| Supabase | (fill from each app's .env.example) | Saint Suaire, Leira | each app's .env, gitignored |
| Hetzner | (fill) | Saint Suaire backend data export 2026-09-04 | ~/SAINT SUAIRE/arcana-hetzner-data-2026-09-04.sql |
| Google Gemini | (fill) | Saint Suaire, Circe query layer | each app's .env |
| Anthropic | (fill) | Finance Dashboard chat, Circe bot | each app's .env, Apps Script properties |
| Lexware | (fill) | Finance Dashboard bills | app .env |
| Telegram bot | (fill) | Circe bot | Apps Script properties |
```
Fill `(fill)` cells from `.env.example` files and `vercel env ls` output only; never paste values.

- [ ] **Step 5: Commit**

Repo: `git add tools/vault/extract-schemas.py && git commit -q -m "feat(vault): schema extractor for the relational schema catalog"`.
Memory repo: `git add knowledge/patterns infrastructure && git commit -q -m "docs(knowledge): relational schema catalog and service registry"`.

---

### Task 6: People and networks interview

**Files:**
- Create: `memory/people/<slug>.md` per person pali names
- Create: `memory/knowledge/findings/2026-10-08-collaboration-map.md`
- Modify: `memory/projects/*.md` (`collaborators` field, Open threads)

**Interfaces:**
- Consumes nothing from scripts; uses `AskUserQuestion` (2 to 4 questions per round, 3 to 5 rounds).
- Produces `collaborators: [slug]` values and the Pixelhausen description Task 5 step 3 needs, and the Finance Dashboard failed-integration answer Task 3 step 8 needs. Run this task before finishing Tasks 3 and 5 if pali is available; otherwise leave those cells marked "pending pali".

- [ ] **Step 1: Round 1, who (AskUserQuestion, multiSelect where sensible)**

Questions: (1) "Name the people who want to collaborate on your apps" (open, via Other). (2) "Which app does each of them want to work on?" (options: Saint Suaire, Leira, KidyTalk, Cadence, Finance Dashboard). (3) "What has been agreed so far?" (options: nothing yet / verbal idea / shared revenue agreed / they would publish under their account). (4) "Where do you talk to them?" (Telegram, WhatsApp, iMessage, email, in person).

- [ ] **Step 2: Round 2, networks and the meeting**

Questions: (1) "When is the meeting with your friends about the dashboards?" (this week / next week / not scheduled). (2) "What should be ready for it?" (the inventory / the schema catalog / a demo of the finance dashboard / a plan for the Pixelhausen pattern). (3) "Which Pixelhausen dashboard features are the pattern you want for yourself?" (open). (4) "Finance Dashboard: which integrations failed?" (Lexware bills / bank balances / exchange rates / AI chat / all).

- [ ] **Step 3: Round 3, networks beyond apps**

Questions: (1) "Which communities or networks matter for your practice?" (open). (2) "Who are the clients or organisations you have built for?" (Curve Labs, Pixelhausen, others via Other). (3) "Anyone who should never appear in this vault?" (open).

- [ ] **Step 4: Write people files with this template**

```markdown
# <Name>

Role: <what they do>
Relationship: <friend | collaborator | client | network>
Projects: [<project slugs>]
Agreement: <plain dated words, or "none yet">
Channel: <where you talk>
Last contact: <date or "unknown">

## Notes

<two to five sentences from the interview>
```
Slug = first name plus initial, lowercase, hyphenated (for example `ataberk-c`). If pali names someone to exclude, write nothing about them anywhere.

- [ ] **Step 5: Write the collaboration map and update project files**

`memory/knowledge/findings/2026-10-08-collaboration-map.md`: a table app × person × agreement status, then the meeting date and its agenda. Set `collaborators` in each project file. Add one Open threads line per pending agreement.

- [ ] **Step 6: Commit the memory repo**

```bash
git add people projects knowledge/findings && git commit -q -m "docs(people): collaborators, networks and the dashboard meeting"
```

---

### Task 7: Decisions

**Files:**
- Create: `memory/knowledge/decisions/2026-10-08-ownership-of-curve-labs-era-repos.md`
- Create: `memory/knowledge/decisions/2026-10-08-apple-developer-account.md`
- Create: `memory/knowledge/decisions/2026-10-08-ios-path-per-app.md`

**Interfaces:**
- Consumes `store_candidate`, `store_path` from Task 4.

- [ ] **Step 1: Ownership decision (recorded, already made)**

```markdown
# Ownership of repos created during Curve Labs work

Date: 2026-10-08
Status: decided by pali

Saint Suaire (arcana-echo) is pali's personal project; it was pushed from the
Curve Labs GitHub login but has nothing to do with the company. The Finance
Dashboard and Project Circe were built by pali for Curve Labs, were not
adopted there, and pali keeps them as her own products and portfolio pieces.
All repos are owned by the polinkasam GitHub account as of 2026-10-08. The
Pixelhausen dashboard was built for Pixelhausen on the pattern of pali's
earlier finance product; the instance is theirs, the pattern is hers.

Evidence: GitHub ownership check 2026-10-03; pali's statement 2026-10-03.
```

- [ ] **Step 2: Apple Developer account recommendation (decision pending pali)**

```markdown
# Apple Developer account: whose name, which entity

Date: 2026-10-08
Status: recommendation; pali decides

## Options

| Option | Cost | Tax effect in Germany | Control |
| --- | --- | --- | --- |
| A. Individual account in pali's name | 99 USD/yr | App sales are commercial income (gewerblich): a Gewerbeanmeldung is needed (around 20 to 60 EUR once); under the Kleinunternehmerregelung no VAT paperwork while turnover stays under 25,000 EUR/yr; income tax applies to profit as with any side income | Full |
| B. Publish under a friend's account | 0 for pali | Income is the friend's; paying pali back is itself a transaction to declare; no saving, only a shift plus dependence | None; listing, payouts, reviews all theirs |
| C. Organization account (needs a legal entity and a D-U-N-S number) | 99 USD/yr plus entity costs | Only sensible once a GmbH/UG exists | Full, transferable |

## Recommendation

A. The tax fear is about registration, not about amount: Apple acts as the
seller to EU consumers and handles consumer VAT, so pali's side is a
Gewerbeanmeldung and declaring profit on the annual tax return. B does not
reduce tax, it moves it to someone else and removes control over the apps
pali wants as passive income. C is for later.

This is not tax advice; confirm the Kleinunternehmer threshold and the
Gewerbeanmeldung with a Steuerberater before enrolling.

## Decision

Pending pali.
```

- [ ] **Step 3: iOS path per app**

```markdown
# iOS path per app

Date: 2026-10-08
Status: recommendation; pali decides

| App | Fit (from readiness) | Path | First blocker |
| --- | --- | --- | --- |
| Leira | ... | ... | ... |
| Cadence | ... | ... | ... |
| Saint Suaire | ... | ... | ... |
| KidyTalk | ... | ... | ... |
| Finance Dashboard | ... | ... | ... |
| Circe | ... | ... | ... |

Rule used: wrap with Capacitor when the app is client-side, has no exposed
keys after a fix, and needs no browser-only API without a plugin; rebuild
only when the interaction depends on native capability; keep as web when
the product is a desktop workflow.

Order to ship: smallest blocker count first.
```
Fill the dots from each project file's Store path section.

- [ ] **Step 4: Commit the memory repo**

```bash
git add knowledge/decisions && git commit -q -m "docs(decisions): ownership, apple developer account, ios path"
```

---

### Task 8: Index, verification, handoff, save

**Files:**
- Create: `tools/vault/build-index.mjs`
- Test: `tools/vault/tests/build-index.test.mjs`
- Create: `memory/projects/index.md`
- Create: `memory/handoffs/<date>-knowledge-vault-inventory.md` (via `/handoff`)

**Interfaces:**
- Consumes `parseFrontmatter` from Task 2 and every project file.

- [ ] **Step 1: Write the failing index test**

`tools/vault/tests/build-index.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildIndex } from "../build-index.mjs";

test("index has one row per project file, alive first, sorted by title", () => {
  const dir = mkdtempSync(join(tmpdir(), "idx-"));
  writeFileSync(join(dir, "b.md"), "---\nslug: b\ntitle: Bravo\ncategory: app\nstatus: dormant\nstore_candidate: no\nlast_touched: 2026-01-01\n---\n\nx\n");
  writeFileSync(join(dir, "a.md"), "---\nslug: a\ntitle: Alpha\ncategory: app\nstatus: alive\nstore_candidate: yes\nlast_touched: 2026-09-01\n---\n\nx\n");
  const md = buildIndex(dir);
  const rows = md.split("\n").filter((l) => l.startsWith("| [") );
  assert.equal(rows.length, 2);
  assert.match(rows[0], /Alpha/);
  assert.match(rows[1], /Bravo/);
  assert.match(md, /\| \[Alpha\]\(a\.md\) \| app \| alive \| yes \| 2026-09-01 \|/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tools/vault/tests/build-index.test.mjs`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Implement build-index.mjs**

```js
#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseFrontmatter } from "./lib/frontmatter.mjs";

const ORDER = { alive: 0, dormant: 1, idea: 2, archived: 3, unknown: 4 };

export function buildIndex(dir) {
  const rows = readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "index.md").map((f) => {
    const { data } = parseFrontmatter(readFileSync(join(dir, f), "utf8"));
    return { file: f, ...data };
  });
  rows.sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9) || String(a.title).localeCompare(String(b.title)));
  const lines = ["# Projects index", "", `Generated ${new Date().toISOString().slice(0, 10)} by tools/vault/build-index.mjs. ${rows.length} projects.`, "",
    "| Project | Category | Status | Store | Last touched |", "| --- | --- | --- | --- | --- |"];
  for (const r of rows) lines.push(`| [${r.title}](${r.file}) | ${r.category} | ${r.status} | ${r.store_candidate} | ${r.last_touched || ""} |`);
  return lines.join("\n") + "\n";
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2] || "memory/projects";
  writeFileSync(join(dir, "index.md"), buildIndex(dir));
  console.log("index written");
}
```

- [ ] **Step 4: Run tests, build the real index**

Run: `node --test tools/vault/tests/` → 12 passing.
Run: `node tools/vault/build-index.mjs memory/projects && head -12 memory/projects/index.md`

- [ ] **Step 5: Verification from the spec**

```bash
# row count equals file count
echo "files: $(ls memory/projects/*.md | grep -v index.md | wc -l)  rows: $(grep -c '^| \[' memory/projects/index.md)"
# live urls of alive apps answer
for f in memory/projects/*.md; do u=$(grep '^live_url:' "$f" | cut -d' ' -f2-); s=$(grep '^status:' "$f" | cut -d' ' -f2); [ "$s" = alive ] && [ -n "$u" ] && printf "%s %s\n" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$u")" "$u"; done
# recall finds Leira
bash bin/search.sh reindex && bash bin/search.sh find "Leira transliteration" --kind keyword
# home repo gone, site repo present
test -d /Users/polinkasam/.git && echo HOME_GIT_STILL_THERE || echo home-git-removed
grep url /Users/polinkasam/projects/apps/portfolio-website/repos/palina-portfolio/.git/config
```
Expected: counts equal; every alive URL returns 200; search output lists `memory/projects/leira.md`; `home-git-removed`; polinkasam URL.

- [ ] **Step 6: Ask pali to read the six alive-app files**

Use AskUserQuestion with one question per two apps: "Is this file right?" options: right / wrong, I'll say what / skip. Apply corrections directly.

- [ ] **Step 7: Commit, handoff, save**

```bash
git add tools/vault && git commit -q -m "feat(vault): generate the projects index" && git log --oneline -1
```
Memory repo: `git add projects && git commit -q -m "docs(projects): index and corrections from pali"`.
Then invoke `/handoff` (addressed to pali's future self: what exists, what is pending her answers, the follow-up specs A to D) and `/save` to push the branch and open the PR against `main` with a body following `.claude/context/pr-format.md`.
