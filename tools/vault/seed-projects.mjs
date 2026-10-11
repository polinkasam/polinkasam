#!/usr/bin/env node
// Seed memory/projects/<slug>.md from the website's lib/project-data.ts.
// Node 25 strips TypeScript types on import, so the .ts file loads directly.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseFrontmatter, serialize, pinnedKeys } from "./lib/frontmatter.mjs";
import { toSlug } from "./lib/slug.mjs";

// Keys the site owns on every run. `stack` is set only when a file is created;
// after that the code scan owns it (apply-scan.mjs). A key listed in the file's
// `pinned` array is never touched.
const SEED_KEYS = ["slug", "title", "category", "on_website", "live_url", "site_description", "site_features"];

const CATEGORY_BY_ARCHIVE = {
  "apps-code": "app",
  apps: "app",
  spatial: "spatial",
  "spatial-installation": "spatial",
  "product-design": "product",
  writing: "writing",
  writings: "writing",
  music: "music",
};
const CATEGORY_BY_FILTER = {
  "Apps & Code": "app",
  "UX/UI Design": "app",
  "Spatial & Installation": "spatial",
  "Product Design": "product",
  "3D & Visual Stories": "visual",
  "Art Direction": "visual",
  Photography: "visual",
  Writing: "writing",
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
    richer.__category = entry.description ? categoryFor(entry, cat) : prev.__category || categoryFor(entry, cat);
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
    "## What it is",
    "",
    what,
    "",
    ...(features ? ["Site-listed features:", "", features, ""] : []),
    "## State of truth",
    "",
    "_Not yet checked against the code._",
    "",
    "## Store path",
    "",
    "_Not assessed._",
    "",
    "## Open threads",
    "",
    "- [ ] Confirm status with pali",
    "",
  ].join("\n");
}

export async function seedProjects({ dataPath, outDir }) {
  mkdirSync(outDir, { recursive: true });
  const entries = await loadSiteEntries(dataPath);
  const created = [];
  const skipped = [];
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
      const pinned = pinnedKeys(data);
      const next = { ...data };
      for (const k of SEED_KEYS) if (!pinned.has(k)) next[k] = seed[k];
      writeFileSync(file, serialize(next, body));
      skipped.push(slug);
    } else {
      const data = {
        ...seed,
        status: "unknown",
        store_candidate: "no",
        store_path: "undecided",
        backend: "unknown",
        repo_local: "",
        repo_remote: "",
        vercel_project: "",
        collaborators: [],
        last_touched: "",
      };
      writeFileSync(file, serialize(data, bodyFor(e)));
      created.push(slug);
    }
  }
  return { created, skipped };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const args = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) args[argv[i].slice(2)] = argv[i + 1];
  const result = await seedProjects({ dataPath: args.data, outDir: args.out });
  console.log(`created ${result.created.length}, refreshed ${result.skipped.length}`);
}
