import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanFolders, detectBackend, detectFramework, walledFromInstances } from "../scan-code.mjs";

function makeTree() {
  const root = mkdtempSync(join(tmpdir(), "scan-"));
  // a real app with git, vercel, supabase
  const app = join(root, "apps", "leira", "repos", "leira");
  mkdirSync(join(app, ".git", "logs"), { recursive: true });
  writeFileSync(join(app, ".git", "config"), '[remote "origin"]\n\turl = https://github.com/polinkasam/leira.git\n');
  writeFileSync(
    join(app, ".git", "logs", "HEAD"),
    "0 1 a <a@b> 1750000000 +0200\tcommit: x\n0 1 a <a@b> 1751000000 +0200\tcommit: y\n",
  );
  mkdirSync(join(app, ".vercel"));
  writeFileSync(join(app, ".vercel", "project.json"), '{"projectName":"leira"}');
  writeFileSync(
    join(app, "package.json"),
    JSON.stringify({ name: "leira", dependencies: { react: "1", vite: "1", "@supabase/supabase-js": "1" } }),
  );
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
  assert.equal(
    records.some((r) => r.folder.startsWith(walled)),
    false,
  );
});

test("assets-only folder is recorded as runnable unknown", async () => {
  const { root, walled } = makeTree();
  const records = await scanFolders({ roots: [join(root, "apps")], walled: [walled] });
  const k = records.find((r) => r.folder.endsWith("kiddy-talk"));
  assert.ok(k);
  assert.equal(k.runnable, "unknown");
  assert.equal(k.repo_remote, "none");
});

test("walled list includes each instance's -memory sibling and excludes self", () => {
  const dir = mkdtempSync(join(tmpdir(), "inst-"));
  const file = join(dir, "instances.json");
  writeFileSync(
    file,
    JSON.stringify([
      { slug: "arcana-echo", path: "/x/apps/arcana-echo/arcana-echo" },
      { slug: "polinkasam", path: "/x/projects/polinkasam" },
    ]),
  );
  const walled = walledFromInstances(file, "/x/projects/polinkasam");
  assert.deepEqual(walled.sort(), ["/x/apps/arcana-echo/arcana-echo", "/x/apps/arcana-echo/arcana-echo-memory"]);
});

test("a folder with python files and a venv is one project, and venv is never entered", async () => {
  const root = mkdtempSync(join(tmpdir(), "py-"));
  const app = join(root, "apps", "watch-my-dreams", "repos", "watch-my-dreams");
  mkdirSync(join(app, "venv", "lib", "python3"), { recursive: true });
  writeFileSync(join(app, "main.py"), "print(1)\n");
  writeFileSync(join(app, "venv", "lib", "python3", "package.json"), "{}");
  const records = await scanFolders({ roots: [join(root, "apps")], walled: [] });
  assert.equal(records.length, 1);
  assert.equal(records[0].folder, app);
  assert.equal(records[0].framework, "python");
  assert.equal(records[0].runnable, "python");
});

test("backend and framework detection", () => {
  assert.equal(detectBackend({ dependencies: { "@prisma/client": "1" } }), "prisma-postgres");
  assert.equal(detectBackend({ dependencies: { "@supabase/supabase-js": "1" } }), "supabase");
  assert.equal(detectBackend({ dependencies: {} }), "none");
  assert.equal(detectFramework({ dependencies: { next: "1" } }), "next");
  assert.equal(detectFramework({ dependencies: { vite: "1", react: "1" } }), "vite-react");
  assert.equal(detectFramework({ dependencies: {} }), "unknown");
});
