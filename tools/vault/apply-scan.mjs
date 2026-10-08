#!/usr/bin/env node
// Merge scan records into memory/projects/<slug>.md frontmatter using mapping.json.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { parseFrontmatter, serialize } from "./lib/frontmatter.mjs";

const ROOT = "/Users/polinkasam/projects";

const PLACEHOLDER_BODY = [
  "## What it is",
  "",
  "_Found on disk, not on the site._",
  "",
  "## State of truth",
  "",
  "_Not yet checked._",
  "",
  "## Store path",
  "",
  "_Not assessed._",
  "",
  "## Open threads",
  "",
  "- [ ] Confirm with pali",
  "",
].join("\n");

export function applyScan({ records, mapping, projectsDir }) {
  const byFolder = new Map(records.map((r) => [r.folder, r]));
  const updated = [];
  const unmapped = [];
  for (const [slug, rel] of Object.entries(mapping)) {
    const rec = byFolder.get(join(ROOT, rel));
    if (!rec) {
      unmapped.push(slug);
      continue;
    }
    const file = join(projectsDir, `${slug}.md`);
    let data = {};
    let body = "";
    if (existsSync(file)) {
      ({ data, body } = parseFrontmatter(readFileSync(file, "utf8")));
    } else {
      data = {
        slug,
        title: slug,
        category: "unknown",
        on_website: false,
        status: "unknown",
        store_candidate: "no",
        store_path: "undecided",
        collaborators: [],
      };
      body = PLACEHOLDER_BODY;
    }
    data.repo_local = rel;
    data.repo_remote = rec.repo_remote;
    data.vercel_project = rec.vercel_project;
    data.last_touched = rec.last_touched;
    data.backend = rec.backend;
    if (rec.stack && rec.stack.length) data.stack = rec.stack;
    writeFileSync(file, serialize(data, body));
    updated.push(slug);
  }
  const mappedFolders = new Set(Object.values(mapping).map((rel) => join(ROOT, rel)));
  const orphans = records.filter((r) => !mappedFolders.has(r.folder)).map((r) => r.folder);
  return { updated, unmapped, orphans };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const here = dirname(fileURLToPath(import.meta.url));
  const records = JSON.parse(readFileSync(join(here, "out", "scan.json"), "utf8"));
  const mapping = JSON.parse(readFileSync(join(here, "mapping.json"), "utf8"));
  const projectsDir = process.argv[2] || "/Users/polinkasam/projects/polinkasam-memory/projects";
  const r = applyScan({ records, mapping, projectsDir });
  console.log(`updated ${r.updated.length}; unmapped slugs: ${r.unmapped.join(", ") || "none"}`);
  console.log("folders with no slug (decide: add to mapping or ignore):\n" + r.orphans.join("\n"));
}
