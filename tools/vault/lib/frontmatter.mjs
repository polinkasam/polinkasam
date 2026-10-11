// Minimal frontmatter: one `key: value` per line. Values are scalars (string,
// number, true/false) or flat arrays. Anything that needs quoting is written as
// JSON, so commas and quotes inside items survive round-trips. A line the
// parser cannot read is an error, never silently dropped: the files are edited
// by people and a dropped line would be deleted on the next write.
export function parseFrontmatter(text) {
  if (!text.startsWith("---\n")) return { data: {}, body: text };
  const end = text.indexOf("\n---\n", 4);
  if (end === -1) return { data: {}, body: text };
  const block = text.slice(4, end);
  let body = text.slice(end + 5);
  if (body.startsWith("\n")) body = body.slice(1);
  const data = {};
  const lines = block.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") continue;
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (!m) {
      throw new Error(
        `cannot read frontmatter line ${i + 2}: ${JSON.stringify(line)} (only flat "key: value" lines and [arrays] are supported)`,
      );
    }
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
    try {
      const arr = JSON.parse(v);
      if (Array.isArray(arr)) return arr.map((x) => (typeof x === "string" ? x : String(x)));
    } catch {
      // not JSON: a bare list like [React, Vite]
    }
    const inner = v.slice(1, -1).trim();
    return inner === "" ? [] : inner.split(",").map((s) => unquote(s.trim()));
  }
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return unquote(v);
}

function unquote(s) {
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    try {
      return JSON.parse(s);
    } catch {
      return s.slice(1, -1);
    }
  }
  if (s.startsWith("'") && s.endsWith("'") && s.length >= 2) return s.slice(1, -1);
  return s;
}

function needsQuoting(s) {
  return /[:#\[\],"'\\]/.test(s) || s !== s.trim() || s === "" || s === "true" || s === "false" || /^-?\d+(\.\d+)?$/.test(s);
}

function formatScalar(v) {
  if (typeof v === "boolean" || typeof v === "number") return String(v);
  const s = String(v);
  return needsQuoting(s) && s !== "" ? JSON.stringify(s) : s;
}

function formatArray(arr) {
  const items = arr.map(String);
  if (items.some(needsQuoting)) return JSON.stringify(items);
  return `[${items.join(", ")}]`;
}

function formatValue(v) {
  if (Array.isArray(v)) return formatArray(v);
  return formatScalar(v);
}

export function serialize(data, body) {
  const lines = Object.entries(data).map(([k, v]) => `${k}: ${formatValue(v)}`);
  return `---\n${lines.join("\n")}\n---\n\n${body}`;
}

// Keys a human has pinned in the file; scripts must not overwrite them.
export function pinnedKeys(data) {
  return new Set(Array.isArray(data.pinned) ? data.pinned : []);
}
