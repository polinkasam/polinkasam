#!/usr/bin/env node
// build-sealed-dataroom.mjs
//
// Builds the Egregore Labs investor data room emissary, SEALED on both faces:
//   - human face: a gate page (render_html) that AES-GCM-decrypts the room
//     HTML in the browser, captures an email, and records the visit.
//   - agent face: a SEALED executable_spec. The four documents (deck, content
//     base, paper, evals) are inlined as ONE encrypted corpus blob — ciphertext
//     only, no plaintext, no child /raw URLs. The agent asks for the room
//     password (intake), runs an embedded deterministic Node helper to decrypt
//     the corpus locally, and works through it in-session.
//
// Invariant: public raw may expose the runnable shell and ciphertext, but
// never the data-room corpus in plaintext (parent or child raw endpoints).
//
// Seal scheme (both faces), same as Cem's "travels under seal" page:
//   PBKDF2-HMAC-SHA256(pw, salt, 250000, 32B) -> AES-256-GCM(iv) -> {s,i,c}
// where c = base64( ciphertext || 16-byte GCM tag )  (WebCrypto layout).
// Both the corpus AND the room HTML are gzipped before encryption; the agent
// gunzips the corpus with node:zlib, the browser gunzips the room via
// DecompressionStream after decrypt. Gzipping the room keeps render_html under
// the relay's custom-render byte cap even with the deck/paper/evals inlined.
//
// Usage:
//   bash bin/node-run.sh bin/build-sealed-dataroom.mjs <room.html> [--password <pw>] \
//        [--out-gate <path>] [--out-answers <path>]
// Password defaults to env DATAROOM_PASSWORD or "collectivegrowth".

import crypto from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const argv = process.argv.slice(2);
const roomPath = argv.find((a) => !a.startsWith('--'));
function flag(name, def) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
}
if (!roomPath) {
  console.error('usage: bash bin/node-run.sh bin/build-sealed-dataroom.mjs <room.html> [--password pw]');
  process.exit(1);
}
const PASSWORD = flag('password', process.env.DATAROOM_PASSWORD || 'collectivegrowth');
const OUT_GATE = flag('out-gate', '/tmp/dataroom-gate.html');
const OUT_ANSWERS = flag('out-answers', '/tmp/dataroom-answers.json');
// Debug/test only: also write the enhanced room BEFORE sealing, so a fixture
// test can assert the enhanceRoomForAgentFlow transform without decrypting.
// Off by default — never written unless --out-room is passed explicitly.
const OUT_ROOM = flag('out-room', '');
// The gate page is served from EMISSARY_WEB_ORIGIN (egregore.xyz), but the
// write API (/api/v1/emissary/gate-visit) lives on the Railway backend — a
// different origin. A relative POST would hit egregore.xyz and never reach
// the API, so the page must call the API at its ABSOLUTE origin (CORS already
// allows egregore.xyz). Override with --api-base / DATAROOM_API_BASE per env.
const API_BASE = flag(
  'api-base',
  process.env.DATAROOM_API_BASE || 'https://egregore-production-55f2.up.railway.app'
).replace(/\/+$/, '');

const ITER = 250000;

// Canonical local corpus — the four documents, committed under
// bin/dataroom-corpus/ (see that dir's SOURCES.md). The build reads these;
// it never fetches live /raw. The former child emissaries (provenance IDs in
// SOURCES.md) are retired. Override the dir with --corpus-dir for tests.
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const CORPUS_DIR = flag('corpus-dir', path.join(SCRIPT_DIR, 'dataroom-corpus'));
const CORPUS_FILES = {
  deck: 'deck.json',
  contentBase: 'content-base.json',
  paper: 'paper.json',
  evals: 'evals.json',
};
// Sanitized snapshots of the live child browser renders. These preserve the
// deck/paper/evals visual designs for the human path while stripping child
// emissary URLs, receiver chrome, and raw launch prompts. They are injected
// into the room before the room seal, so published output still carries only
// ciphertext. Override with --render-dir for tests.
const RENDER_DIR = flag('render-dir', path.join(SCRIPT_DIR, 'dataroom-renders'));
const BROWSER_RENDER_FILES = {
  deck: 'deck.html',
  paper: 'paper.html',
  evals: 'evals.html',
};
const BROWSER_DOCS = {
  deck: {
    title: 'The Deck',
    label: 'Deck',
    sourceId: '6dd3a4bd-bfbd-4285-9383-e3a89367f580',
  },
  paper: {
    title: 'Technical Paper',
    label: 'Paper',
    sourceId: 'df51f4e8-6185-487d-93fc-84ecf5b66000',
  },
  evals: {
    title: 'Evals',
    label: 'Evals',
    sourceId: 'e32c7245-7d22-4cb6-9c63-b00ae0db7075',
  },
};
// The canonical install command shown on every emissary surface. Single
// constant on purpose: copy it to any other surface that emits an install
// command, and the room-enhance regex normalizes older variants to this.
const INSTALL_COMMAND = 'npx egregore-emissary@latest install';

// Font stacks: lead with the design's Spectral / IBM Plex Mono, then fall
// back to the room's own serif/mono so the section reads correctly even if
// the room does not load the Google fonts.
const SERIF_STACK = `'Spectral','Iowan Old Style',Palatino,Georgia,serif`;
const MONO_STACK = `'IBM Plex Mono','SF Mono',ui-monospace,Menlo,monospace`;

// Variant A — "Wired flow". A skill-first vertical flow with a connector
// spine; install once (step 1), then open the room by handing the agent the
// bare page URL (step 2). De-alarming copy: no "packet" / "run this" /
// "launch prompt" — step 2 is a sanctioned skill invocation on a URL.
//
// FIXED-DARK EXCEPTION: colors below are emitted as literal hex on purpose.
// The sealed data room is a bespoke, always-dark standalone artifact — there
// is no light mode and no theme toggle that a CSS variable could let override.
// The token-only/dark-mode rule governs the theme-overridable renderer in
// packages/egregore-artifacts, not this page; the design handoff specifies
// these exact values as the source of truth. Do not "tokenize" without a real
// light-mode target to override them.
const AGENT_FLOW_CSS = `
  .agent-path { width:100%; max-width:760px; margin:60px auto 0; }
  .agent-path .eg-nav-copy { transition:background .15s; }
  .agent-path .eg-nav-copy:hover { background:rgba(225,140,80,0.14); }
  .agent-path .eg-nav-copy:active { background:rgba(225,140,80,0.22); }
`;

const AGENT_FLOW_HTML = `
  <section class="action agent-path" data-eg-agent-path="1">
    <div style="font-family:${MONO_STACK}; font-size:11px; letter-spacing:0.2em; text-transform:uppercase; color:#c2683f;">Navigate with your agent</div>
    <div style="font-family:${SERIF_STACK}; font-size:clamp(18px,2.4vw,20px); line-height:1.5; color:#e7dccf; margin-top:13px;">This room is an emissary — your agent can walk you through it.</div>
    <div style="font-family:${MONO_STACK}; font-size:12px; line-height:1.7; color:#8f8073; margin-top:9px;">New here? Start at step 1. Already have the skill? Skip to step 2.</div>
    <div style="height:1px; background:rgba(210,150,110,0.12); margin:clamp(20px,3vw,28px) 0 clamp(20px,3vw,26px);"></div>
    <div style="display:flex; flex-direction:column;">
      <div style="display:flex; align-items:stretch; gap:clamp(12px,2vw,18px);">
        <div style="flex:none; width:32px; display:flex; flex-direction:column; align-items:center;">
          <div style="width:32px; height:32px; border-radius:50%; border:1px solid rgba(225,140,80,0.55); color:#e2864a; font-family:${MONO_STACK}; font-size:13px; display:flex; align-items:center; justify-content:center;">1</div>
          <div style="flex:1; width:1px; background:linear-gradient(180deg,#e2864a77,#e2864a22); margin-top:8px;"></div>
        </div>
        <div style="flex:1; min-width:0; padding-bottom:clamp(24px,3vw,32px);">
          <div style="display:flex; align-items:center; gap:9px;">
            <div style="flex:none; width:16px; border-top:1px dashed rgba(225,140,80,0.55);"></div>
            <div style="flex:none; font-family:${MONO_STACK}; font-size:11px; letter-spacing:0.13em; text-transform:uppercase; color:#c2683f;">For first-time users <span style="color:#6f6256;">· one-time</span></div>
            <div style="flex:1; min-width:14px; border-top:1px dashed rgba(225,140,80,0.3);"></div>
            <div style="flex:none; color:#e2864a; font-family:${MONO_STACK}; font-size:12px; line-height:1;">▸</div>
          </div>
          <div style="display:flex; gap:18px; flex-wrap:wrap; align-items:flex-start; margin-top:12px;">
            <div style="flex:1 1 230px; min-width:200px;">
              <div style="font-family:${SERIF_STACK}; font-size:clamp(18px,2.2vw,20px); color:#ece1d4;">Install the receiver skill</div>
              <div style="font-family:${SERIF_STACK}; font-size:14.5px; line-height:1.55; color:#a99a8b; margin-top:6px;">Paste this into your terminal once. It teaches your agent how to open Egregore emissaries. One-time setup, consent at every step.</div>
            </div>
            <div style="flex:1 1 240px; min-width:225px; background:#140e0a; border:1px solid rgba(225,140,80,0.16); border-radius:7px; padding:13px;">
              <div style="font-family:${MONO_STACK}; font-size:12.5px; color:#d7c3b2; word-break:break-all; line-height:1.5;">${INSTALL_COMMAND}</div>
              <button class="eg-nav-copy" data-eg-copy="${INSTALL_COMMAND}" style="margin-top:11px; width:100%; min-height:44px; font-family:${MONO_STACK}; font-size:11px; letter-spacing:0.06em; text-transform:uppercase; color:#e2864a; background:transparent; border:1px solid rgba(225,140,80,0.4); border-radius:5px; padding:0 11px; cursor:pointer;">Copy</button>
            </div>
          </div>
        </div>
      </div>
      <div style="display:flex; align-items:stretch; gap:clamp(12px,2vw,18px);">
        <div style="flex:none; width:32px; display:flex; flex-direction:column; align-items:center;">
          <div style="width:32px; height:32px; border-radius:50%; background:#e2864a; color:#1a120e; font-family:${MONO_STACK}; font-size:13px; display:flex; align-items:center; justify-content:center;">2</div>
        </div>
        <div style="flex:1; min-width:0;">
          <div style="display:flex; align-items:center; gap:9px;">
            <div style="flex:none; width:16px; border-top:1px dashed rgba(225,140,80,0.55);"></div>
            <div style="flex:none; font-family:${MONO_STACK}; font-size:11px; letter-spacing:0.13em; text-transform:uppercase; color:#e2864a;">Once installed <span style="color:#8f8073;">· everyone lands here</span></div>
            <div style="flex:1; min-width:14px; border-top:1px dashed rgba(225,140,80,0.3);"></div>
            <div style="flex:none; color:#e2864a; font-family:${MONO_STACK}; font-size:12px; line-height:1;">▸</div>
          </div>
          <div style="display:flex; gap:18px; flex-wrap:wrap; align-items:flex-start; margin-top:12px;">
            <div style="flex:1 1 230px; min-width:200px;">
              <div style="font-family:${SERIF_STACK}; font-size:clamp(18px,2.2vw,20px); color:#ece1d4;">Open the room</div>
              <div style="font-family:${SERIF_STACK}; font-size:14.5px; line-height:1.55; color:#a99a8b; margin-top:6px;">Paste the link into Claude Code — or any agent harness. With the skill installed, your agent opens the room and walks you through the deck, paper, and evals.</div>
            </div>
            <div style="flex:1 1 240px; min-width:225px; background:#140e0a; border:1px solid rgba(225,140,80,0.16); border-radius:7px; padding:13px;">
              <div id="agent-s2-code" style="font-family:${MONO_STACK}; font-size:12.5px; color:#d7c3b2; word-break:break-all; line-height:1.5;">https://egregore.xyz/emissary/e/…</div>
              <button id="agent-s2-btn" class="eg-nav-copy" data-eg-copy="" style="margin-top:11px; width:100%; min-height:44px; font-family:${MONO_STACK}; font-size:11px; letter-spacing:0.06em; text-transform:uppercase; color:#e2864a; background:transparent; border:1px solid rgba(225,140,80,0.4); border-radius:5px; padding:0 11px; cursor:pointer;">Copy</button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div style="height:1px; background:rgba(210,150,110,0.12); margin:clamp(20px,3vw,26px) 0 16px;"></div>
    <div style="font-family:${MONO_STACK}; font-size:11px; letter-spacing:0.04em; color:#6f6256;">no account · consent at every step · works in any agent harness</div>
  </section>`;

const AGENT_FLOW_SCRIPT = `
<script data-eg-agent-flow-script="1">
(function(){
  var pageUrl = location.origin + location.pathname.replace(/\\/+$/,'');
  var code = document.getElementById('agent-s2-code');
  var btn = document.getElementById('agent-s2-btn');
  if (code) code.textContent = pageUrl;
  if (btn) btn.setAttribute('data-eg-copy', pageUrl);
  document.querySelectorAll('.agent-path [data-eg-copy]').forEach(function(b){
    b.addEventListener('click', function(){
      var text = b.getAttribute('data-eg-copy') || '';
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text);
        } else {
          var ta = document.createElement('textarea');
          ta.value = text; document.body.appendChild(ta); ta.select();
          document.execCommand('copy'); document.body.removeChild(ta);
        }
      } catch (e) {}
      var old = b.textContent;
      b.textContent = '✓ Copied';
      clearTimeout(b._t);
      b._t = setTimeout(function(){ b.textContent = old; }, 1600);
    });
  });
})();
</script>`;

const BROWSER_DOCS_CSS = `
  .gcard[data-eg-doc-open] { cursor:pointer; }
  .gcard[data-eg-doc-open]:focus-visible { outline:2px solid rgba(226,134,74,0.9); outline-offset:4px; }
  .gcard[data-eg-doc-open] .gstatus.live { color:#e2864a; }
  .eg-doc-modal[aria-hidden="true"] { display:none; }
  .eg-doc-modal { position:fixed; inset:0; z-index:90; display:grid; grid-template-rows:auto 1fr; background:rgba(8,5,3,0.94); backdrop-filter:blur(10px); }
  .eg-doc-modal-head { display:flex; align-items:center; gap:14px; min-height:58px; padding:12px clamp(14px,3vw,28px); border-bottom:1px solid rgba(226,134,74,0.18); background:#120c08; }
  .eg-doc-modal-kicker { font-family:${MONO_STACK}; font-size:10px; letter-spacing:0.22em; text-transform:uppercase; color:#c2683f; }
  .eg-doc-modal-title { font-family:${SERIF_STACK}; font-size:clamp(18px,2.5vw,23px); color:#ede1d3; margin-left:auto; margin-right:auto; text-align:center; }
  .eg-doc-modal-close { flex:none; min-width:42px; height:38px; border:1px solid rgba(226,134,74,0.4); border-radius:6px; background:transparent; color:#e2864a; font-family:${MONO_STACK}; font-size:20px; line-height:1; cursor:pointer; }
  .eg-doc-modal-close:hover { background:rgba(226,134,74,0.1); }
  .eg-doc-modal-body { min-height:0; padding:clamp(10px,2vw,18px); }
  .eg-doc-frame { display:none; width:100%; height:calc(100vh - 86px); border:1px solid rgba(226,134,74,0.16); border-radius:10px; background:#15110c; }
  .eg-doc-frame[data-eg-active="1"] { display:block; }
  body.eg-doc-open { overflow:hidden; }
`;

function escAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function assertNoBrowserDocLeaks(label, html) {
  const checks = [
    [/\/emissary\/e\/[0-9a-fA-F-]+/i, 'child emissary URL'],
    [/\/raw\b/i, 'raw URL'],
    [/Run this Egregore/i, 'launch prompt'],
    [/\beg-receiver\b/i, 'receiver chrome'],
    [/Copy launch prompt/i, 'launch button'],
  ];
  for (const [rx, what] of checks) {
    if (rx.test(html)) {
      console.error(`FAIL: ${label} browser render contains ${what}`);
      process.exit(2);
    }
  }
}

function buildBrowserDocsHtml(renders) {
  const frames = Object.entries(BROWSER_DOCS).map(([id, doc]) => {
    const srcdoc = renders[id];
    if (!srcdoc) throw new Error(`missing browser render: ${id}`);
    return `<iframe class="eg-doc-frame" data-eg-doc-panel="${id}" title="${escAttr(doc.title)}" sandbox="allow-scripts" srcdoc="${escAttr(srcdoc)}"></iframe>`;
  }).join('\n    ');
  return `
  <div class="eg-doc-modal" data-eg-browser-docs="1" aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="eg-doc-modal-title">
    <div class="eg-doc-modal-head">
      <div class="eg-doc-modal-kicker">Sealed in-room document</div>
      <div class="eg-doc-modal-title" id="eg-doc-modal-title">Document</div>
      <button type="button" class="eg-doc-modal-close" data-eg-doc-close aria-label="Close document">×</button>
    </div>
    <div class="eg-doc-modal-body">
      ${frames}
    </div>
  </div>
  <script data-eg-browser-docs-script="1">
  (function(){
    var modal = document.querySelector('[data-eg-browser-docs]');
    if (!modal) return;
    var title = document.getElementById('eg-doc-modal-title');
    var labels = ${JSON.stringify(Object.fromEntries(Object.entries(BROWSER_DOCS).map(([id, doc]) => [id, doc.title])))};
    function openDoc(id) {
      var frame = modal.querySelector('[data-eg-doc-panel="' + id + '"]');
      if (!frame) return;
      modal.querySelectorAll('[data-eg-doc-panel]').forEach(function(el){ el.setAttribute('data-eg-active', el === frame ? '1' : '0'); });
      if (title) title.textContent = labels[id] || 'Document';
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('eg-doc-open');
    }
    function closeDoc() {
      modal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('eg-doc-open');
      modal.querySelectorAll('[data-eg-doc-panel]').forEach(function(el){ el.setAttribute('data-eg-active', '0'); });
    }
    document.querySelectorAll('[data-eg-doc-open]').forEach(function(link){
      link.addEventListener('click', function(ev){
        ev.preventDefault();
        openDoc(link.getAttribute('data-eg-doc-open'));
      });
    });
    modal.addEventListener('click', function(ev){ if (ev.target === modal) closeDoc(); });
    var close = modal.querySelector('[data-eg-doc-close]');
    if (close) close.addEventListener('click', closeDoc);
    document.addEventListener('keydown', function(ev){ if (ev.key === 'Escape' && modal.getAttribute('aria-hidden') === 'false') closeDoc(); });
  })();
  </script>`;
}

function injectBeforeClose(html, tag, fragment) {
  const rx = new RegExp(`</${tag}\\s*>`, 'i');
  return rx.test(html) ? html.replace(rx, `${fragment}\n</${tag}>`) : `${html}\n${fragment}`;
}

function enhanceRoomForAgentFlow(html) {
  let out = String(html);
  // Replace the room's original CTA with variant A AND drop the trailing
  // "packet source" mechanism block — variant A already says how to open the
  // room, so the <details class="mech"> panel is redundant noise.
  out = out.replace(
    /<section class="action">[\s\S]*?<\/section>\s*<details class="mech">[\s\S]*?<\/details>/,
    AGENT_FLOW_HTML,
  );
  out = out
    .replace(
      '# the Egregore Labs data room — packet\n# derived from this page; full at /raw',
      '# the Egregore Labs data room — emissary\n# open with this page link',
    )
    .replace(
      '// self-resolving CTA — the page learns its own /raw at runtime',
      '// self-resolving legacy CTA — copies the page link when present',
    )
    .replace(
      "const prompt = 'Run this Egregore packet for me: ' + base + '/raw';",
      'const prompt = base;',
    )
    .replace(
      "if (s) s.textContent = base + '/raw';",
      'if (s) s.textContent = base;',
    );
  out = out.replace(
    /npx(?: -y)? egregore-emissary@latest install(?: --require-email)?/g,
    INSTALL_COMMAND,
  );
  if (!out.includes('data-eg-agent-path="1"')) return out;
  if (!out.includes('.agent-path')) out = injectBeforeClose(out, 'style', AGENT_FLOW_CSS);
  if (!out.includes('data-eg-agent-flow-script="1"')) {
    out = injectBeforeClose(out, 'body', AGENT_FLOW_SCRIPT);
  }
  return out;
}

function enhanceRoomForBrowserDocs(html, renders) {
  let out = String(html);
  out = out.replace(/<link\b(?=[^>]*\brel=["']alternate["'])(?=[^>]*\/raw\b)[^>]*>/gi, '');
  for (const [id, doc] of Object.entries(BROWSER_DOCS)) {
    const url = `https://egregore.xyz/emissary/e/${doc.sourceId}`;
    out = out.replace(
      `href="${url}" target="_blank"`,
      `href="#${id}" data-eg-doc-open="${id}" aria-haspopup="dialog"`,
    );
  }
  out = out.replace(/<span class="gstatus live">live ↗<\/span>/g, '<span class="gstatus live">sealed · open</span>');
  if (!out.includes('data-eg-browser-docs="1"')) {
    out = injectBeforeClose(out, 'style', BROWSER_DOCS_CSS);
    out = injectBeforeClose(out, 'body', buildBrowserDocsHtml(renders));
  }
  return out;
}

function enhanceRoom(html, renders) {
  return enhanceRoomForBrowserDocs(enhanceRoomForAgentFlow(html), renders);
}

// ── seal: bytes|string -> {s,i,c} base64 (c = ciphertext||tag) ───────────
function seal(plaintext, password) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(password, salt, ITER, 32, 'sha256');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const buf = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext, 'utf8');
  const ct = Buffer.concat([cipher.update(buf), cipher.final()]);
  const tag = cipher.getAuthTag(); // 16 bytes
  return {
    s: salt.toString('base64'),
    i: iv.toString('base64'),
    c: Buffer.concat([ct, tag]).toString('base64'),
  };
}

// ── self-test: decrypt to raw bytes via WebCrypto exactly like the browser
//    will, before it gunzips. Returns the gzipped room bytes; the caller
//    gunzips and compares to the original room HTML.
async function unsealBytesWebCrypto(P, password) {
  const b64 = (s) => Uint8Array.from(Buffer.from(s, 'base64'));
  const km = await webcrypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await webcrypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: b64(P.s), iterations: ITER, hash: 'SHA-256' }, km, 256);
  const key = await webcrypto.subtle.importKey('raw', bits, 'AES-GCM', false, ['decrypt']);
  const pt = await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(P.i) }, key, b64(P.c));
  return Buffer.from(new Uint8Array(pt));
}

// ── self-test: decrypt to raw bytes exactly like the embedded agent helper.
//    Mirrors DECRYPT_HELPER below — the build verifies the same math the
//    agent will run before it ships the blob.
function unsealBytesNode(P, password) {
  const b = (x) => Buffer.from(x, 'base64');
  const key = crypto.pbkdf2Sync(password, b(P.s), ITER, 32, 'sha256');
  const data = b(P.c);
  const ct = data.subarray(0, data.length - 16);
  const tag = data.subarray(data.length - 16);
  const d = crypto.createDecipheriv('aes-256-gcm', key, b(P.i));
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]);
}

// ── the deterministic decrypt helper the agent runs VERBATIM ─────────────
//    node decrypt-corpus.mjs <password>   (sealed {s,i,c} JSON on stdin →
//    decrypted corpus JSON on stdout). Same PBKDF2/AES-GCM/gzip as the build.
const DECRYPT_HELPER = `import { pbkdf2Sync, createDecipheriv } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
const pw = process.argv[2];
if (!pw) { process.stderr.write('usage: node decrypt-corpus.mjs <password>  (sealed JSON on stdin)\\n'); process.exit(2); }
const { s, i, c } = JSON.parse(await new Response(process.stdin).text());
const b = (x) => Buffer.from(x, 'base64');
const key = pbkdf2Sync(pw, b(s), 250000, 32, 'sha256');
const data = b(c), ct = data.subarray(0, data.length - 16), tag = data.subarray(data.length - 16);
const d = createDecipheriv('aes-256-gcm', key, b(i)); d.setAuthTag(tag);
process.stdout.write(gunzipSync(Buffer.concat([d.update(ct), d.final()])).toString('utf8'));`;

// ── the SEALED agent action (password-gated, ciphertext only) ────────────
// Built at the bottom from the encrypted corpus blob. The action embeds the
// ciphertext and the decrypt helper; it names NO document URLs and carries NO
// plaintext corpus. The agent asks for the password and decrypts locally.
function buildAction(corpusSeal) {
  const SEALED = JSON.stringify(corpusSeal); // {s,i,c}
  return `Purpose: help the investor work through the Egregore Labs data room as one corpus. The corpus is SEALED — it is included below as ciphertext only. You decrypt it locally with the room password. Never fetch it from anywhere; everything you need is in this spec, and there are no document URLs.

HOW TO ASK QUESTIONS (important): every time this flow asks the investor to CHOOSE between options — the work-through menu, which document to browse, and each document's own intake — you MUST present it through the harness's interactive multiple-choice question UI: the AskUserQuestion tool in Claude Code, the question chips in the web app. Never render a choice as a plain numbered list or as free text when that UI is available — a numbered list is only a fallback for harnesses that have no interactive question UI at all. Ask one question at a time and wait for the answer. If a question has more than four options (the paper's and evals' FOCUS), ask it in two short AskUserQuestion rounds rather than a wall of text. The single exception is the room password, which is free-text input — just prompt for it.

1. Your first step is to ask the investor for the room password the sender gave them (free-text input — not a multiple choice). Ask nothing else yet — the password comes before the menu.

2. Decrypt the corpus locally with that password. This needs a code-capable harness (Claude Code, Codex, or a local runtime). If you CANNOT run code, stop and tell the investor exactly this:
"This room is sealed. Your current harness cannot run the local decrypt helper. Open the room link in a browser, enter your email and password there, or use Claude Code/Codex with the receiver skill installed."
Otherwise: write the helper below to a temp file (e.g. decrypt-corpus.mjs), pipe the SEALED CORPUS JSON to it on stdin with the password as the first argument, and read the decrypted corpus JSON from stdout. Keep the decrypted corpus IN-SESSION ONLY — do not write it to disk unless a chosen path produces an artifact (e.g. the IC memo or an on-demand figure). If decryption fails, the password is wrong: say the seal held and ask for the correct password. Do not guess.

--- decrypt helper (node — run verbatim) ---
${DECRYPT_HELPER}
--- end helper ---

--- sealed corpus (ciphertext {s,i,c}: AES-256-GCM over gzipped JSON) ---
${SEALED}
--- end sealed corpus ---

3. The decrypted corpus is a JSON object { deck, contentBase, paper, evals }. Each value is a full document artifact that carries its OWN runnable flow in body.executable_spec — its intake questions and its action — with the document's content embedded verbatim. Treat them as one relational corpus: the deck's claims are grounded by the content base, the paper's architecture, and the evals' numbers. (Traction · Articles of Association are available on request via the Egregore Labs team — not included here. The content base is the deck's founder answer base — back-end grounding for the deck, NOT a separate document to offer.)

4. Only now, after the corpus is decrypted, ask the investor how they want to work through the room — as a single AskUserQuestion (question chips) with exactly these four options, never a numbered list:
  · Browse a specific document — the deck, the technical paper, or the evals
  · Navigate the diligence — ask across the whole room
  · Assess fit to my thesis, or draft an investment memo
  · Book a follow-up call with the team

5. Run the selected path against the decrypted corpus:

  - Browse a specific document: ask which one — as an AskUserQuestion with three options: the deck, the technical paper, or the evals (never the content base; it is the deck's grounding, not a document to browse). Then RUN that document's own flow exactly as it runs on its own, using its artifact in the corpus and the content it carries:
    · The deck (corpus.deck): present the Egregore Labs seed deck, grounded STRICTLY in the deck's answer base (the content base it carries). First ask its intake as an AskUserQuestion — how they want to go through it: "Walk me through it slide by slide" or "I will ask about specific topics". On a walk-through, take the slides in order: Cognitive Entropy → an organization is the sum of its interactions → The Stack → Emissaries → Tiers of Depth → Organizational Continual Learning → The Team → the Ask. Operating rules: canonical numbers ($4M SAFE / ~10% / 24 months); cite a number with its source and nothing more; never volunteer a negative unprompted; THE DEFENSE RULE — if an answer is not in the base, do not invent, infer, or oversell — say you will follow up. Deep architecture questions defer to the technical paper; evaluation numbers/method defer to the evals — offer to take them there.
    · The technical paper (corpus.paper): be a reading partner for "An Organizational Continual Learning Runtime for Human–AI Teams". First ask its intake as AskUserQuestion — LENS (Investor / Technical reviewer / Skeptic), then FOCUS (the runtime architecture · emissaries & handoffs · the initial evaluation · the OCL thesis · governance · walk the whole paper) — and since FOCUS has more than four options, ask it across two short AskUserQuestion rounds rather than a list. Adopt their lens and start where their focus says. Answer any section at their depth, STRICTLY from the paper; if a question runs past it, say you will follow up. VISUALIZE ON DEMAND: when asked to show the stack, diagram the loop, chart the evaluation, draw how an emissary folds into Egregore, or map the five capacities, generate a clean self-contained SVG/HTML figure in the paper's gold-on-paper style (cream #f5f2ea, gold #9c6c1e, Georgia serif), write it to ./<slug>.html and open it. Honesty: the evaluation (0.37 → 0.43 → 0.97) is an initial controlled study; adaptation today is runtime-level, model-level is future — don't overclaim.
    · The evals (corpus.evals): be a partner for the evaluation report "Measuring Agentic Continuity". First ask its intake as AskUserQuestion — LENS (Investor / Technical reviewer / Skeptic), then FOCUS (the result in 90 seconds · the conditions & hiddenness gradient · how it was scored · the results in detail · the self-audit · scope & limitations) — and since FOCUS has more than four options, ask it across two short AskUserQuestion rounds rather than a list. If they want the result in 90 seconds: the question (when work passes between agents, what must travel — structure or shared context?), the two metrics (completeness vs fidelity), and the headline (overall fidelity 0.365 → 0.431 → 0.968 across R1 → R2 → R3; the R2→R3 gain scales with hiddenness: /recap +0.718, /broadcast +0.520, /capture +0.373). Answer STRICTLY from the report and anchor claims to its numbers; never invent. State scope/limitations honestly if asked, but don't over-lead with caveats unprompted. VISUALIZE ON DEMAND: chart fidelity by condition, the R2→R3 jump, completeness, etc., in the report's style (cream #f5f2ea, gold #9c6c1e, gray bars), write to ./<slug>.html and open it.
    After a document, offer to return to the room or move to another document.

  - Navigate the diligence: index the room, summarize any document, answer questions strictly from the corpus, cross-referencing where the documents reinforce each other.

  - Assess fit / draft a memo: ask which — as an AskUserQuestion: assess fit, or draft a memo.
    · Assess fit: ask 2–3 questions about thesis / stage / check size, then give an honest read and surface the most relevant documents. "Not a fit" is a fine conclusion.
    · Draft an investment memo: synthesize into ./egregore-labs-ic-memo.md — thesis, what is built vs roadmap, evidence, team, the ask ($4M SAFE / ~10% / 24 months), risks, recommendation.

  - Book a follow-up call with the team: share https://calendly.com/cem-egregore/30min and offer to help them pick a time.

6. A follow-up call is always available. If the investor asks to talk to the team, book a call, or speak to a human at any point, share https://calendly.com/cem-egregore/30min and help them pick a time.

7. Evidence discipline: if an answer is not in the corpus, say so and offer a follow-up. Canonical numbers: $4M / ~10% / 24 months. Honest over impressive.

8. End by pointing the investor to the single document they should open next.`;
}

// ── the human gate page (render_html) ────────────────────────────────────
function gatePage(R) {
  const P = JSON.stringify(R);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta property="og:type" content="article" />
<meta property="og:site_name" content="Egregore Labs" />
<meta property="og:title" content="Egregore Labs — Investor Data Room" />
<meta property="og:description" content="Deck, technical paper, and evals as one corpus. Sealed — password required." />
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="Egregore Labs — Investor Data Room" />
<meta name="twitter:description" content="Deck, technical paper, and evals as one corpus. Sealed — password required." />
<meta name="robots" content="noindex">
<title>Egregore Labs — Sealed Data Room</title>
<style>
:root {
  --cream: #1D1611; --black: rgba(255,255,255,0.92); --dark: rgba(255,255,255,0.75);
  --border: rgba(255,255,255,0.08); --muted: rgba(255,255,255,0.50);
  --warm-gray: rgba(255,255,255,0.30); --terracotta: #D4875A; --card-bg: #241E19;
  --font-serif: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  --font-mono: "SF Mono", ui-monospace, "JetBrains Mono", Menlo, monospace;
}
* { box-sizing: border-box; margin: 0; }
::selection { background: var(--terracotta); color: #1D1611; }
body { background: var(--cream); color: var(--dark); font-family: var(--font-serif);
  min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 2rem; }
.gate { max-width: 440px; width: 100%; text-align: center; }
.seal-mark { font-size: 40px; color: var(--terracotta); margin-bottom: 1.4rem; letter-spacing: 0.1em; }
.kicker { font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.24em; text-transform: uppercase; color: var(--terracotta); margin-bottom: 0.9rem; }
h1 { font-size: 26px; font-weight: 500; color: var(--black); margin-bottom: 0.7rem; }
.sub { font-size: 14.5px; font-style: italic; color: var(--muted); margin-bottom: 2rem; line-height: 1.6; }
.emailrow { margin-bottom: 0.7rem; }
.pwrow { display: flex; gap: 0.6rem; }
input { flex: 1; width: 100%; background: var(--card-bg); border: 1px solid var(--border); border-radius: 50px;
  color: var(--black); font-family: var(--font-mono); font-size: 14px; padding: 11px 18px;
  text-align: center; letter-spacing: 0.12em; outline: none; transition: border-color 0.2s; }
input:focus { border-color: var(--terracotta); }
button { background: var(--terracotta); color: #1D1611; border: none; border-radius: 50px;
  font-family: var(--font-mono); font-size: 12.5px; font-weight: 600; letter-spacing: 0.04em;
  padding: 11px 22px; cursor: pointer; white-space: nowrap; }
button:hover { opacity: 0.9; }
button:disabled { opacity: 0.45; cursor: wait; }
.msg { font-family: var(--font-mono); font-size: 11px; color: var(--muted); margin-top: 1.1rem; min-height: 1.2em; }
.msg.err { color: var(--terracotta); }
.foot { margin-top: 3rem; font-family: var(--font-mono); font-size: 10px; color: var(--warm-gray); line-height: 1.8; }
.shake { animation: shake 0.35s; }
@keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-7px)} 75%{transform:translateX(7px)} }
</style>
</head>
<body data-eg-wrapper="sealed-dataroom">
<div class="gate" id="gate">
  <div class="seal-mark">⬡</div>
  <div class="kicker">Egregore Labs · Investor Data Room</div>
  <h1>This data room travels under seal</h1>
  <p class="sub">Egregore Labs — deck, technical paper, and evals, as one corpus.<br>The contents are encrypted; enter your email and the password to break the seal.</p>
  <div class="emailrow">
    <input type="email" id="em" placeholder="your email" autocomplete="email" autofocus>
  </div>
  <div class="pwrow">
    <input type="password" id="pw" placeholder="password" autocomplete="off">
    <button id="go" onclick="unseal()">Unseal</button>
  </div>
  <p class="msg" id="msg"></p>
  <p class="foot">AES-256-GCM · the password never leaves your browser and decrypts the room locally<br>your email is recorded so the Egregore Labs team knows who's reviewing · egregore labs · 2026</p>
</div>
<script>
var R = ${P};
var API = ${JSON.stringify(API_BASE)};
var EID = (location.pathname.match(/emissary\\/e\\/([0-9a-fA-F-]+)/) || [])[1] || '';
function b64(s){ var b = atob(s), a = new Uint8Array(b.length); for (var i=0;i<b.length;i++) a[i]=b.charCodeAt(i); return a; }
function track(email, ok){
  try {
    fetch(API + '/api/v1/emissary/gate-visit', {
      method:'POST', headers:{'Content-Type':'application/json'}, keepalive:true,
      body: JSON.stringify({ emissary_id: EID, email: email, face: 'human', password_correct: ok })
    }).catch(function(){});
  } catch(e) {}
}
async function unseal(){
  var email = document.getElementById('em').value.trim();
  var pw = document.getElementById('pw').value;
  var msg = document.getElementById('msg'), btn = document.getElementById('go');
  if (!email) { msg.className='msg err'; msg.textContent='enter your email to continue'; return; }
  if (!pw) { msg.className='msg err'; msg.textContent='enter the password'; return; }
  if (typeof DecompressionStream === 'undefined') {
    msg.className='msg err';
    msg.textContent='this browser is too old to open the sealed room — use a current Chrome, Firefox 113+, or Safari 16.4+';
    return;
  }
  btn.disabled = true; msg.className='msg'; msg.textContent='deriving key…';
  try {
    var km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
    var bits = await crypto.subtle.deriveBits({name:'PBKDF2', salt:b64(R.s), iterations:250000, hash:'SHA-256'}, km, 256);
    var key = await crypto.subtle.importKey('raw', bits, 'AES-GCM', false, ['decrypt']);
    var pt = await crypto.subtle.decrypt({name:'AES-GCM', iv:b64(R.i)}, key, b64(R.c));
    var ds = new DecompressionStream('gzip');
    var html = await new Response(new Blob([pt]).stream().pipeThrough(ds)).text();
    track(email, true);
    document.open(); document.write(html); document.close();
  } catch(e) {
    track(email, false);
    btn.disabled = false;
    msg.className = 'msg err'; msg.textContent = 'the seal holds — wrong password';
    var g = document.getElementById('gate'); g.classList.remove('shake'); void g.offsetWidth; g.classList.add('shake');
  }
}
document.getElementById('pw').addEventListener('keydown', function(e){ if (e.key === 'Enter') unseal(); });
document.getElementById('em').addEventListener('keydown', function(e){ if (e.key === 'Enter') document.getElementById('pw').focus(); });
</script>
</body>
</html>`;
}

// ── build ────────────────────────────────────────────────────────────────
const browserRenders = {};
for (const [key, file] of Object.entries(BROWSER_RENDER_FILES)) {
  const html = readFileSync(path.join(RENDER_DIR, file), 'utf8');
  assertNoBrowserDocLeaks(`${key}.html`, html);
  browserRenders[key] = html;
}

const roomHtml = enhanceRoom(readFileSync(roomPath, 'utf8'), browserRenders);
if (/\/emissary\/e\/[0-9a-fA-F-]+/i.test(roomHtml)) {
  console.error('FAIL: sealed browser room contains a child emissary URL'); process.exit(2);
}
if (/\/raw\b/i.test(roomHtml)) {
  console.error('FAIL: sealed browser room contains a raw URL'); process.exit(2);
}
if (OUT_ROOM) writeFileSync(OUT_ROOM, roomHtml);
// gzip-then-encrypt the room (same construction the corpus uses) so render_html
// stays under the relay's custom-render cap with the deck/paper/evals inlined.
const roomGz = gzipSync(Buffer.from(roomHtml, 'utf8'));
const roomSeal = seal(roomGz, PASSWORD);

// self-test the human seal before writing anything: decrypt to bytes via
// WebCrypto (exactly the browser path) then gunzip and compare to the original.
const roomBack = gunzipSync(await unsealBytesWebCrypto(roomSeal, PASSWORD)).toString('utf8');
if (roomBack !== roomHtml) { console.error('FAIL: room round-trip mismatch'); process.exit(2); }
let wrongFailed = false;
try { await unsealBytesWebCrypto(roomSeal, PASSWORD + 'x'); } catch { wrongFailed = true; }
if (!wrongFailed) { console.error('FAIL: wrong password decrypted'); process.exit(2); }

// ── corpus: read local files, assemble, gzip, seal (agent face) ──────────
const corpus = {};
for (const [key, file] of Object.entries(CORPUS_FILES)) {
  const raw = readFileSync(path.join(CORPUS_DIR, file), 'utf8');
  corpus[key] = JSON.parse(raw); // throws on malformed → build fails loud
}
const corpusJson = JSON.stringify(corpus);
const corpusGz = gzipSync(Buffer.from(corpusJson, 'utf8'));
const corpusSeal = seal(corpusGz, PASSWORD);

// self-test the corpus seal with the SAME math the agent helper runs:
// round-trips to the exact JSON, and the wrong password fails the GCM tag.
const corpusBack = gunzipSync(unsealBytesNode(corpusSeal, PASSWORD)).toString('utf8');
if (corpusBack !== corpusJson) { console.error('FAIL: corpus round-trip mismatch'); process.exit(2); }
let corpusWrongFailed = false;
try { unsealBytesNode(corpusSeal, PASSWORD + 'x'); } catch { corpusWrongFailed = true; }
if (!corpusWrongFailed) { console.error('FAIL: corpus decrypted with wrong password'); process.exit(2); }

const agentAction = buildAction(corpusSeal);
// Invariant guard — fail the build if the agent face leaks plaintext or a
// child /raw URL. The corpus must travel as ciphertext only.
if (/\/emissary\/e\/[0-9a-fA-F-]+\/raw/.test(agentAction)) {
  console.error('FAIL: agent action contains a child /raw URL'); process.exit(2);
}

const gateHtml = gatePage(roomSeal);
const answers = {
  kind: 'executable',
  topic: 'Egregore Labs — investor data room',
  claim: 'Work through the Egregore Labs data room — the deck, technical paper, and evals as one corpus — by browsing any document with its own guided walkthrough, navigating the diligence, assessing fit, drafting an investment memo, or booking a call with the team.',
  ask: 'How do you want to work through the room — browse a document, navigate, assess fit, draft a memo, or book a call?',
  summary: 'Renç sent you the Egregore Labs investor data room as a sealed emissary. Open it in your browser under seal, or paste the room link into Claude Code after installing the receiver skill; it will ask how you want to work through the corpus and for the room password, then decrypt it locally — the documents never travel in the clear.',
  prose: 'This room gathers the deck, the technical paper on the runtime, and the evals that quantify its impact as one relational corpus. Read it in your browser, or paste the room link into Claude Code and have your agent work through it with you. Against atomised acceleration, towards systems of collective growth.',
  archetype: 'default',
  role_topology: {
    runner_role: 'receiver',
    respondent_role: 'runner',
    subject_role: 'runner',
    beneficiary_role: 'runner',
    author_run_mode: 'run_normally',
  },
  distribution: 'public',
  executable_spec: {
    intake: [
      {
        id: 'room_password',
        type: 'text',
        prompt: 'Enter the data-room password',
        required: true,
      },
    ],
    action: agentAction,
    output: { target: 'receiver_artifact' },
    success_criteria: [
      'the room password is the FIRST thing asked, before any menu; the corpus is decrypted locally from the embedded ciphertext using it — never fetched, and no document URLs are used',
      'after decrypting, the agent asks how the investor wants to work through the room, using interactive choices when the harness supports them',
      'the work-through options include browsing a specific document (deck, paper, or evals) and booking a follow-up call with the team',
      'browsing a document runs that document\'s own flow — the deck as the founder; the paper and evals with their lens+focus intake and visualize-on-demand — grounded strictly in the in-session corpus',
      'the content base is treated as the deck\'s grounding, never offered as a separate document to browse',
      'whenever the investor asks to talk to the team, the agent shares https://calendly.com/cem-egregore/30min',
      'answers name corpus gaps instead of fabricating missing facts',
    ],
  },
  // A sealed gate is a `wrapper`-scope custom render: the canonical
  // dual-faced object is sealed behind the password, so the outer page has
  // no faces/CTA. The data-eg-wrapper marker on the gate authorizes the
  // create lint to relax the shell-marker block (see interview.js); without
  // this declaration the lint defaults to strict `surface` and rejects it.
  render_scope: 'wrapper',
  render_mode: 'custom',
  render_html: gateHtml,
};

writeFileSync(OUT_GATE, gateHtml);
writeFileSync(OUT_ANSWERS, JSON.stringify(answers, null, 2));

console.log('✓ seal self-tests passed (room + corpus round-trip; wrong password rejected)');
console.log('  human face    : SEALED — internal deck/paper/evals renders, no child links');
console.log('  agent face    : SEALED — password intake + embedded decrypt helper, ciphertext only');
console.log('  invariant     : no child /raw URLs, no plaintext corpus in the action');
console.log('  gate-visit API:', API_BASE + '/api/v1/emissary/gate-visit');
console.log('  password      :', PASSWORD);
console.log('  room blob      :', roomSeal.c.length, 'b64 chars');
console.log('  corpus blob    :', corpusSeal.c.length, 'b64 chars (gzip of', corpusJson.length, 'B JSON)');
console.log('  gate page      :', OUT_GATE, '(' + gateHtml.length + ' bytes)');
console.log('  answers json   :', OUT_ANSWERS);
