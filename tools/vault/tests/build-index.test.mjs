import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildIndex } from "../build-index.mjs";

test("index has one row per project file, alive first, sorted by title", () => {
  const dir = mkdtempSync(join(tmpdir(), "idx-"));
  writeFileSync(
    join(dir, "b.md"),
    "---\nslug: b\ntitle: Bravo\ncategory: app\nstatus: dormant\nstore_candidate: no\nlast_touched: 2026-01-01\n---\n\nx\n",
  );
  writeFileSync(
    join(dir, "a.md"),
    "---\nslug: a\ntitle: Alpha\ncategory: app\nstatus: alive\nstore_candidate: yes\nlast_touched: 2026-09-01\n---\n\nx\n",
  );
  writeFileSync(join(dir, "index.md"), "# stale index\n");
  const md = buildIndex(dir);
  const rows = md.split("\n").filter((l) => l.startsWith("| ["));
  assert.equal(rows.length, 2);
  assert.match(rows[0], /Alpha/);
  assert.match(rows[1], /Bravo/);
  assert.match(md, /\| \[Alpha\]\(a\.md\) \| app \| alive \| yes \| 2026-09-01 \|/);
});
