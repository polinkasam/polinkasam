import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
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
  writeFileSync(
    p,
    `---\nslug: leira\ntitle: Old Title\nstatus: alive\nrepo_local: apps/layra/repos/leira\n---\n\n## What it is\n\nPali edited this.\n`,
  );
  const result = await seedProjects({ dataPath: fixture, outDir: out });
  const l = parseFrontmatter(readFileSync(p, "utf8"));
  assert.equal(l.data.title, "Leira");
  assert.equal(l.data.status, "alive");
  assert.equal(l.data.repo_local, "apps/layra/repos/leira");
  assert.equal(l.body, "## What it is\n\nPali edited this.\n");
  assert.equal(result.skipped.length, 5);
  assert.equal(result.created.length, 0);
});
