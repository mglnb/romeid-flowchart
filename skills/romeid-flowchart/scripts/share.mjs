#!/usr/bin/env node
/**
 * Zero-dependency fallback for the romeid-flowchart skill.
 * Builds a Romeid share link from Mermaid source with basic sanity checks.
 * Prefer the MCP tool `share_flowchart` or `npx -y @mglnb/romeid share`, which run the
 * real Mermaid parser; use this when neither is available (offline, sandboxed).
 *
 *   node share.mjs diagram.mmd --title "Checkout"
 *   node share.mjs diagram.mmd --notes notes.json   # {"nodeId": "Markdown note", ...}
 *   cat diagram.mmd | node share.mjs --json
 */
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const DEFAULT_BASE_URL = "https://romeid.mnbdev.space/app";

/* lz-string compressToEncodedURIComponent (MIT, pieroxy), rewritten compactly. */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$";

export function compressToEncodedURIComponent(input) {
  const out = [];
  let acc = 0;
  let pos = 0;
  const write = (value, bits) => {
    for (let i = 0; i < bits; i++) {
      acc = (acc << 1) | (value & 1);
      value >>= 1;
      if (pos === 5) {
        out.push(ALPHABET[acc]);
        acc = 0;
        pos = 0;
      } else pos++;
    }
  };

  const dict = new Map();
  const pending = new Set();
  let w = "";
  let enlargeIn = 2;
  let size = 3;
  let bits = 2;
  const grow = () => {
    if (--enlargeIn === 0) {
      enlargeIn = 2 ** bits;
      bits++;
    }
  };
  const emit = () => {
    if (pending.has(w)) {
      const code = w.charCodeAt(0);
      if (code < 256) {
        write(0, bits);
        write(code, 8);
      } else {
        write(1, bits);
        write(code, 16);
      }
      grow();
      pending.delete(w);
    } else {
      write(dict.get(w), bits);
    }
    grow();
  };

  for (let i = 0; i < input.length; i++) {
    const c = input.charAt(i);
    if (!dict.has(c)) {
      dict.set(c, size++);
      pending.add(c);
    }
    const wc = w + c;
    if (dict.has(wc)) w = wc;
    else {
      emit();
      dict.set(wc, size++);
      w = c;
    }
  }
  if (w !== "") emit();
  write(2, bits);
  for (;;) {
    acc <<= 1;
    if (pos === 5) {
      out.push(ALPHABET[acc]);
      break;
    }
    pos++;
  }
  return out.join("");
}

/* ------------------------------------------------------------------ checks */

const HEADER = /^(\s*(?:%%.*\n\s*)*(?:---[\s\S]*?---\s*\n\s*)?)(flowchart|graph)(?:[ \t]+(TB|TD|BT|LR|RL))?[ \t]*(;?)/i;

function normalize(input) {
  let code = String(input).replace(/\r\n?/g, "\n");
  const fenced = /```[\w-]*[ \t]*\n([\s\S]*?)```/.exec(code);
  if (fenced) code = fenced[1];
  return code.replace(/^\s*\n/, "").replace(/\s+$/, "") + "\n";
}

function withDirection(code, dir) {
  if (!dir) return code;
  if (HEADER.test(code)) return code.replace(HEADER, (_m, pre, kw, _d, semi) => `${pre}${kw} ${dir}${semi}`);
  return `flowchart ${dir}\n${code}`;
}

/** Catches the mistakes agents make most often. Not a full parser. */
export function basicChecks(code) {
  const problems = [];
  if (!HEADER.test(code)) problems.push({ line: 1, message: "First line must be `flowchart TD` (or LR/BT/RL) or `graph TD`." });
  let depth = 0;
  code.split("\n").forEach((raw, i) => {
    const line = raw.replace(/%%.*$/, "");
    const n = i + 1;
    if (/^\s*subgraph\b/.test(line)) depth++;
    if (/^\s*end\s*$/.test(line)) depth--;
    else if (/(^|[\s>|&-])end\s*($|[\s;&-])/.test(line)) problems.push({ line: n, message: '"end" is reserved; use another node id.' });
    // Collapse shape delimiters ([( )], ([ ]), [[ ]], {{ }}, ((( ))) ...) before looking inside labels.
    const bare = line
      .replace(/"[^"]*"/g, '""')
      .replace(/\(\(\(|\(\(|\(\[|\[\(|\[\[|\{\{/g, (m) => m[0])
      .replace(/\)\)\)|\)\)|\]\)|\)\]|\]\]|\}\}/g, (m) => m[m.length - 1]);
    if (/\[[^\]]*[(){}][^\]]*\]/.test(bare) || /\{[^}]*[()[\]][^}]*\}/.test(bare) || /\([^)]*[[\]{}][^)]*\)/.test(bare)) {
      problems.push({ line: n, message: 'Brackets or parentheses inside a label must be quoted, e.g. A["Pay (card)"].' });
    }
    if ((line.match(/"/g) ?? []).length % 2) problems.push({ line: n, message: "Unbalanced quotes; write a literal quote as #quot;." });
  });
  if (depth > 0) problems.push({ message: `${depth} subgraph(s) missing \`end\`.` });
  return problems;
}

/* --------------------------------------------------------------------- run */

const APPEARANCE = {
  palette: ["aurora", "brasa", "oceano", "grafite"],
  nodeStyle: ["soft", "vivid"],
  colorMode: ["semantic", "depth", "group"],
  edgeStyle: ["orthogonal", "curved", "straight"],
};

/* Step notes: Markdown keyed by node id, same limits as the site (code points). */
const NOTE_LIMITS = { note: 2000, total: 20000, count: 200, id: 100 };

export function cleanNotes(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const entries = [];
  let total = 0;
  for (const id of Object.keys(input).sort()) {
    const raw = input[id];
    const idLength = Array.from(id).length;
    if (typeof raw !== "string" || !idLength || idLength > NOTE_LIMITS.id || /[\s\p{Cc}]/u.test(id)) continue;
    const text = Array.from(raw.trim()).slice(0, NOTE_LIMITS.note);
    if (!text.length || entries.length >= NOTE_LIMITS.count || total + text.length > NOTE_LIMITS.total) continue;
    total += text.length;
    entries.push([id, text.join("")]);
  }
  return entries.length ? Object.fromEntries(entries) : undefined;
}

export function buildLink({ code, title, settings = {}, notes }, base) {
  const clean = {};
  for (const [key, allowed] of Object.entries(APPEARANCE)) if (allowed.includes(settings[key])) clean[key] = settings[key];
  if (settings.perspective === true) clean.perspective = true;
  const stepNotes = cleanNotes(notes);
  const doc = { code, ...(title ? { title } : {}), ...(Object.keys(clean).length ? { settings: clean } : {}), ...(stepNotes ? { notes: stepNotes } : {}) };
  const url = new URL(base || process.env.ROMEID_URL || DEFAULT_BASE_URL);
  url.hash = "";
  return `${url.toString()}#d=${compressToEncodedURIComponent(JSON.stringify(doc))}`;
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      title: { type: "string", short: "t" },
      direction: { type: "string", short: "d" },
      palette: { type: "string" },
      style: { type: "string" },
      colors: { type: "string" },
      edges: { type: "string" },
      "3d": { type: "boolean" },
      notes: { type: "string" },
      base: { type: "string" },
      force: { type: "boolean" },
      json: { type: "boolean" },
    },
  });

  const file = positionals[0];
  let source = "";
  if (file && file !== "-") source = readFileSync(file, "utf8");
  else for await (const chunk of process.stdin) source += chunk;

  const dir = values.direction?.toUpperCase().replace("TD", "TB");
  const code = withDirection(normalize(source), ["TB", "LR", "BT", "RL"].includes(dir) ? dir : undefined);
  const problems = basicChecks(code);
  if (problems.length && !values.force) {
    if (values.json) console.log(JSON.stringify({ ok: false, problems }, null, 2));
    else for (const p of problems) console.error(`✗ ${p.line ? `line ${p.line}: ` : ""}${p.message}`);
    process.exitCode = 2;
    return;
  }

  let notes;
  if (values.notes) {
    notes = JSON.parse(readFileSync(values.notes, "utf8"));
    if (!notes || typeof notes !== "object" || Array.isArray(notes)) throw new Error("--notes must be a JSON object mapping node ids to Markdown strings.");
  }
  const url = buildLink(
    {
      code,
      title: values.title,
      notes,
      settings: { palette: values.palette, nodeStyle: values.style, colorMode: values.colors, edgeStyle: values.edges, perspective: values["3d"] },
    },
    values.base,
  );
  if (values.json) console.log(JSON.stringify({ ok: true, url, validated: "basic" }, null, 2));
  else console.log(url);
}

const invokedDirectly = process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err?.message ?? err);
    process.exitCode = 1;
  });
}
