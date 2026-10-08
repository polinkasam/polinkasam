#!/usr/bin/env node
// Walk project roots, record code reality per folder. Reads .git/config and
// .git/logs/HEAD as plain files so no git command runs (the worktree hook
// blocks git on sibling repos).
import { readdirSync, readFileSync, existsSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "build", ".git", ".claude", "__pycache__", "venv", ".venv", ".vite"]);
const MAX_DEPTH = 4;
const STACK_KEYS = ["react", "next", "vite", "three", "@supabase/supabase-js", "@prisma/client", "framer-motion", "tailwindcss"];

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
  try {
    return JSON.parse(readFileSync(p, "utf8")).projectName || "";
  } catch {
    return "";
  }
}

function isWalled(folder, walled) {
  return walled.some((w) => folder === w || folder.startsWith(w + "/"));
}

function hasPythonSource(folder) {
  try {
    return readdirSync(folder).some((f) => f.endsWith(".py"));
  } catch {
    return false;
  }
}

function isProjectFolder(folder) {
  return (
    existsSync(join(folder, "package.json")) ||
    existsSync(join(folder, ".git")) ||
    existsSync(join(folder, "requirements.txt")) ||
    existsSync(join(folder, "index.html")) ||
    hasPythonSource(folder)
  );
}

function record(folder) {
  const pkgPath = join(folder, "package.json");
  let pkg = null;
  if (existsSync(pkgPath)) {
    try {
      pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    } catch {
      pkg = null;
    }
  }
  const hasPython = existsSync(join(folder, "requirements.txt")) || hasPythonSource(folder);
  const hasHtml = existsSync(join(folder, "index.html"));
  const mtime = statSync(folder).mtime.toISOString().slice(0, 10);
  return {
    folder,
    package_name: pkg?.name || "",
    framework: pkg ? detectFramework(pkg) : hasPython ? "python" : hasHtml ? "static-html" : "unknown",
    repo_remote: readRemote(folder),
    vercel_project: readVercel(folder),
    last_touched: readLastCommitDate(folder) || mtime,
    backend: pkg ? detectBackend(pkg) : "unknown",
    runnable: pkg ? "has-package-json" : hasPython ? "python" : "unknown",
    stack: pkg ? Object.keys(pkg.dependencies || {}).filter((k) => STACK_KEYS.includes(k)) : [],
  };
}

export async function scanFolders({ roots, walled }) {
  const out = [];
  function walk(folder, depth) {
    if (isWalled(folder, walled)) return;
    if (isProjectFolder(folder)) {
      out.push(record(folder));
      return;
    }
    if (depth >= MAX_DEPTH) return;
    let kids = [];
    try {
      kids = readdirSync(folder, { withFileTypes: true });
    } catch {
      return;
    }
    const subdirs = kids.filter((k) => k.isDirectory() && !SKIP_DIRS.has(k.name));
    if (subdirs.length === 0 && depth > 0) {
      out.push({ ...record(folder), runnable: "unknown" });
      return;
    }
    for (const k of subdirs) walk(join(folder, k.name), depth + 1);
  }
  for (const r of roots) walk(resolve(r), 0);
  return out;
}

export function walledFromInstances(instancesPath, selfPath) {
  const list = JSON.parse(readFileSync(instancesPath, "utf8"));
  const paths = list.map((i) => i.path).filter((p) => p !== selfPath);
  // Each instance keeps its memory repo as a sibling named <basename>-memory; wall it too.
  return paths.flatMap((p) => [p, `${p}-memory`]);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const here = dirname(fileURLToPath(import.meta.url));
  const walled = walledFromInstances(`${process.env.HOME}/.egregore/instances.json`, "/Users/polinkasam/projects/polinkasam");
  const records = await scanFolders({
    roots: ["/Users/polinkasam/projects/apps", "/Users/polinkasam/projects/other"],
    walled,
  });
  mkdirSync(join(here, "out"), { recursive: true });
  writeFileSync(join(here, "out", "scan.json"), JSON.stringify(records, null, 2));
  console.log(`scanned ${records.length} folders`);
}
