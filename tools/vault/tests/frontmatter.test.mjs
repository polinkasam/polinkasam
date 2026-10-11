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

test("array items containing commas and quotes survive repeated round-trips", () => {
  const data = { slug: "x", site_features: ["Spreads — single card, three-card, Celtic Cross", 'say "hi"', "plain"] };
  let text = serialize(data, "body\n");
  for (let i = 0; i < 3; i++) {
    const parsed = parseFrontmatter(text);
    assert.deepEqual(parsed.data, data);
    text = serialize(parsed.data, parsed.body);
  }
});

test("throws on a frontmatter line it cannot read instead of dropping it", () => {
  const text = "---\nslug: x\ncollaborators:\n  - lea\n---\n\nbody\n";
  assert.throws(() => parseFrontmatter(text), /cannot read frontmatter line 4/);
});

test("returns empty data when no frontmatter", () => {
  const { data, body } = parseFrontmatter("# Just a title\n");
  assert.deepEqual(data, {});
  assert.equal(body, "# Just a title\n");
});
