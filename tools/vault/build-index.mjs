#!/usr/bin/env node
// Generate memory/projects/index.md from every project file's frontmatter.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseFrontmatter } from "./lib/frontmatter.mjs";

const ORDER = { alive: 0, dormant: 1, idea: 2, archived: 3, unknown: 4 };

export function buildIndex(dir) {
  const rows = readdirSync(dir)
    .filter((f) => f.endsWith(".md") && f !== "index.md")
    .map((f) => {
      const { data } = parseFrontmatter(readFileSync(join(dir, f), "utf8"));
      return { file: f, ...data };
    });
  rows.sort(
    (a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9) || String(a.title).localeCompare(String(b.title)),
  );
  const lines = [
    "# Projects index",
    "",
    `Generated ${new Date().toISOString().slice(0, 10)} by tools/vault/build-index.mjs. ${rows.length} projects.`,
    "",
    "| Project | Category | Status | Store | Last touched |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const r of rows) {
    lines.push(`| [${r.title}](${r.file}) | ${r.category} | ${r.status} | ${r.store_candidate} | ${r.last_touched || ""} |`);
  }
  return lines.join("\n") + "\n";
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2] || "/Users/polinkasam/projects/polinkasam-memory/projects";
  writeFileSync(join(dir, "index.md"), buildIndex(dir));
  console.log("index written");
}
