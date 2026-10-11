import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyScan } from "../apply-scan.mjs";
import { parseFrontmatter } from "../lib/frontmatter.mjs";

const ROOT = "/Users/polinkasam/projects";

test("applies scan keys to an existing file, keeps other keys and body", () => {
  const dir = mkdtempSync(join(tmpdir(), "apply-"));
  writeFileSync(
    join(dir, "leira.md"),
    "---\nslug: leira\ntitle: Leira\nstatus: alive\nstack: [React]\n---\n\n## What it is\n\nPali wrote this.\n",
  );
  const records = [
    {
      folder: join(ROOT, "apps/layra/repos/leira"),
      repo_remote: "none",
      vercel_project: "leira",
      last_touched: "2026-06-27",
      backend: "supabase",
      stack: ["react", "vite", "@supabase/supabase-js"],
    },
  ];
  const result = applyScan({ records, mapping: { leira: "apps/layra/repos/leira" }, projectsDir: dir });
  const { data, body } = parseFrontmatter(readFileSync(join(dir, "leira.md"), "utf8"));
  assert.equal(data.status, "alive");
  assert.equal(data.repo_local, "apps/layra/repos/leira");
  assert.equal(data.repo_remote, "none");
  assert.equal(data.vercel_project, "leira");
  assert.equal(data.last_touched, "2026-06-27");
  assert.equal(data.backend, "supabase");
  assert.deepEqual(data.stack, ["react", "vite", "@supabase/supabase-js"]);
  assert.equal(body, "## What it is\n\nPali wrote this.\n");
  assert.deepEqual(result.updated, ["leira"]);
});

test("pinned keys are never overwritten by the scan", () => {
  const dir = mkdtempSync(join(tmpdir(), "apply-"));
  writeFileSync(
    join(dir, "arcana-echo.md"),
    '---\nslug: arcana-echo\nvercel_project: arcana-echo-v2\nlive_url: "https://arcana-echo-v2.vercel.app"\npinned: [vercel_project, live_url]\n---\n\nbody\n',
  );
  const records = [
    { folder: join(ROOT, "apps/arcana-echo/repos/arcana-echo"), repo_remote: "https://github.com/polinkasam/arcana-echo.git", vercel_project: "arcana-echo", last_touched: "2026-01-18", backend: "supabase", stack: ["react"] },
  ];
  applyScan({ records, mapping: { "arcana-echo": "apps/arcana-echo/repos/arcana-echo" }, projectsDir: dir });
  const { data } = parseFrontmatter(readFileSync(join(dir, "arcana-echo.md"), "utf8"));
  assert.equal(data.vercel_project, "arcana-echo-v2");
  assert.equal(data.live_url, "https://arcana-echo-v2.vercel.app");
  assert.equal(data.repo_remote, "https://github.com/polinkasam/arcana-echo.git");
});

test("creates a file for a mapped slug missing from the site, and reports unmapped slugs and orphan folders", () => {
  const dir = mkdtempSync(join(tmpdir(), "apply-"));
  const records = [
    { folder: join(ROOT, "apps/pale-wind"), repo_remote: "https://github.com/polinkasam/pale-wind-site.git", vercel_project: "pale-wind", last_touched: "2026-08-07", backend: "none", stack: [] },
    { folder: join(ROOT, "apps/angelic"), repo_remote: "none", vercel_project: "", last_touched: "2026-06-11", backend: "unknown", stack: [] },
  ];
  const result = applyScan({
    records,
    mapping: { "pale-wind": "apps/pale-wind", ghost: "apps/does-not-exist" },
    projectsDir: dir,
  });
  assert.ok(existsSync(join(dir, "pale-wind.md")));
  const { data } = parseFrontmatter(readFileSync(join(dir, "pale-wind.md"), "utf8"));
  assert.equal(data.on_website, false);
  assert.equal(data.repo_remote, "https://github.com/polinkasam/pale-wind-site.git");
  assert.deepEqual(result.unmapped, ["ghost"]);
  assert.deepEqual(result.orphans, [join(ROOT, "apps/angelic")]);
});
