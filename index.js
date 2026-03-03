#!/usr/bin/env node
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { stdout } from 'process';

// ─── ANSI Colors ─────────────────────────────────────────────────────────────

const C = {
  reset:  '\x1b[0m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
};

let useColor = true;

function color(code, text) {
  return useColor ? `${code}${text}${C.reset}` : text;
}

// ─── Argument Parser ─────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    files: [],
    path: null,
    ignore: [],
    output: 'tree',
    color: true,
    exitCode: false,
    keysOnly: false,
    valuesOnly: false,
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    } else if (a === '--version' || a === '-v') {
      console.log('1.0.0');
      process.exit(0);
    } else if (a === '--path') {
      opts.path = args[++i];
    } else if (a === '--ignore') {
      opts.ignore.push(args[++i]);
    } else if (a === '--output' || a === '-o') {
      const fmt = args[++i];
      if (!['unified', 'side-by-side', 'tree', 'json'].includes(fmt)) {
        fatal(`Unknown output format: ${fmt}. Use: unified, side-by-side, tree, json`);
      }
      opts.output = fmt;
    } else if (a === '--no-color') {
      opts.color = false;
    } else if (a === '--exit-code') {
      opts.exitCode = true;
    } else if (a === '--keys-only') {
      opts.keysOnly = true;
    } else if (a === '--values-only') {
      opts.valuesOnly = true;
    } else if (!a.startsWith('-')) {
      opts.files.push(a);
    } else {
      fatal(`Unknown option: ${a}`);
    }
  }

  if (opts.files.length < 2) {
    printHelp();
    process.exit(1);
  }

  return opts;
}

function fatal(msg) {
  console.error(`Error: ${msg}`);
  process.exit(2);
}

function printHelp() {
  console.log(`
json-diff — diff two JSON files with zero dependencies

Usage:
  json-diff <file1.json> <file2.json> [options]
  jdiff <file1.json> <file2.json> [options]

Options:
  --path <jsonpath>            Compare at a specific JSON path (e.g. "users[0].address")
  --ignore <path>              Ignore a path in diff (repeatable)
  --output <format>            Output format: tree (default), unified, side-by-side, json
  --no-color                   Disable color output
  --exit-code                  Exit with code 1 if files differ (for CI)
  --keys-only                  Only show added/removed keys, not value changes
  --values-only                Only show value changes, not structural changes
  -h, --help                   Show this help
  -v, --version                Show version

Examples:
  json-diff a.json b.json
  json-diff a.json b.json --output unified
  json-diff a.json b.json --path "users[0]"
  json-diff a.json b.json --ignore "meta.timestamp" --output json
  json-diff a.json b.json --exit-code   # CI-friendly
`);
}

// ─── JSON Path Resolver ───────────────────────────────────────────────────────

function resolvePath(obj, pathStr) {
  if (!pathStr) return obj;
  const parts = pathStr.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let cur = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') {
      fatal(`Path "${pathStr}" not found in JSON`);
    }
    cur = cur[part];
  }
  return cur;
}

// ─── LCS-based Array Diff ────────────────────────────────────────────────────

// Heuristic identity for LCS: objects with an id/key/name field that matches
// are considered "same item" even if contents differ (so we recurse into them).
function sameIdentity(a, b) {
  if (deepEqual(a, b)) return true;
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a)) {
    const idKeys = ['id', 'key', 'name', 'slug', 'uuid', 'email'];
    for (const k of idKeys) {
      if (k in a && k in b && a[k] === b[k]) return true;
    }
  }
  return false;
}

function lcs(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (sameIdentity(a[i - 1], b[j - 1])) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack
  const result = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && sameIdentity(a[i - 1], b[j - 1])) {
      result.unshift({ type: 'equal', aIdx: i - 1, bIdx: j - 1 });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'added', bIdx: j - 1 });
      j--;
    } else {
      result.unshift({ type: 'removed', aIdx: i - 1 });
      i--;
    }
  }
  return result;
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === 'object') {
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    if (!deepEqual(ka, kb)) return false;
    return ka.every(k => deepEqual(a[k], b[k]));
  }
  return false;
}

// ─── Core Diff Engine ─────────────────────────────────────────────────────────

function diff(a, b, path = '', ignorePaths = []) {
  const changes = [];

  function shouldIgnore(p) {
    return ignorePaths.some(ig => p === ig || p.startsWith(ig + '.') || p.startsWith(ig + '['));
  }

  function compare(av, bv, p) {
    if (shouldIgnore(p)) return;

    const typeA = getType(av);
    const typeB = getType(bv);

    if (typeA !== typeB) {
      changes.push({ path: p, type: 'type-change', from: av, to: bv, fromType: typeA, toType: typeB });
      return;
    }

    if (typeA === 'array') {
      const ops = lcs(av, bv);
      for (const op of ops) {
        if (op.type === 'equal') {
          // Recurse into matched items to surface nested diffs
          compare(av[op.aIdx], bv[op.bIdx], `${p}[${op.bIdx}]`);
        } else if (op.type === 'removed') {
          changes.push({ path: `${p}[${op.aIdx}]`, type: 'removed', from: av[op.aIdx], to: undefined });
        } else if (op.type === 'added') {
          changes.push({ path: `${p}[${op.bIdx}]`, type: 'added', from: undefined, to: bv[op.bIdx] });
        }
      }
      return;
    }

    if (typeA === 'object') {
      const keysA = new Set(Object.keys(av));
      const keysB = new Set(Object.keys(bv));

      for (const k of keysA) {
        const childPath = p ? `${p}.${k}` : k;
        if (!keysB.has(k)) {
          if (!shouldIgnore(childPath)) {
            changes.push({ path: childPath, type: 'removed', from: av[k], to: undefined });
          }
        } else {
          compare(av[k], bv[k], childPath);
        }
      }

      for (const k of keysB) {
        const childPath = p ? `${p}.${k}` : k;
        if (!keysA.has(k)) {
          if (!shouldIgnore(childPath)) {
            changes.push({ path: childPath, type: 'added', from: undefined, to: bv[k] });
          }
        }
      }
      return;
    }

    // Primitive
    if (av !== bv) {
      changes.push({ path: p, type: 'changed', from: av, to: bv });
    }
  }

  compare(a, b, path);
  return changes;
}

function getType(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

// ─── Output Formatters ────────────────────────────────────────────────────────

function formatValue(v) {
  if (v === undefined) return 'undefined';
  if (typeof v === 'string') return `"${v}"`;
  if (v === null) return 'null';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function formatTree(changes, opts) {
  if (changes.length === 0) {
    return color(C.dim, '(no differences)');
  }

  const lines = [];

  for (const ch of changes) {
    const p = color(C.cyan, ch.path || '(root)');

    if (ch.type === 'added') {
      if (opts.valuesOnly) continue;
      lines.push(color(C.green, `+ ${ch.path || '(root)'}: ${formatValue(ch.to)}`));
    } else if (ch.type === 'removed') {
      if (opts.valuesOnly) continue;
      lines.push(color(C.red, `- ${ch.path || '(root)'}: ${formatValue(ch.from)}`));
    } else if (ch.type === 'changed') {
      if (opts.keysOnly) continue;
      lines.push(
        color(C.yellow, `~ ${ch.path || '(root)'}`) +
        ': ' +
        color(C.red, formatValue(ch.from)) +
        ' → ' +
        color(C.green, formatValue(ch.to))
      );
    } else if (ch.type === 'type-change') {
      if (opts.keysOnly) continue;
      lines.push(
        color(C.yellow, `~ ${ch.path || '(root)'}`) +
        ` (${color(C.red, ch.fromType)} → ${color(C.green, ch.toType)}): ` +
        color(C.red, formatValue(ch.from)) +
        ' → ' +
        color(C.green, formatValue(ch.to))
      );
    }
  }

  return lines.join('\n');
}

function formatUnified(changes, file1, file2, opts) {
  const lines = [];
  lines.push(color(C.bold, `--- ${file1}`));
  lines.push(color(C.bold, `+++ ${file2}`));
  lines.push(color(C.dim, `@@ structural diff @@`));

  for (const ch of changes) {
    const p = ch.path || '(root)';
    if (ch.type === 'added') {
      if (opts.valuesOnly) continue;
      lines.push(color(C.green, `+ [${p}] ${formatValue(ch.to)}`));
    } else if (ch.type === 'removed') {
      if (opts.valuesOnly) continue;
      lines.push(color(C.red, `- [${p}] ${formatValue(ch.from)}`));
    } else if (ch.type === 'changed' || ch.type === 'type-change') {
      if (opts.keysOnly) continue;
      lines.push(color(C.red,   `- [${p}] ${formatValue(ch.from)}`));
      lines.push(color(C.green, `+ [${p}] ${formatValue(ch.to)}`));
    }
  }

  return lines.join('\n');
}

function formatSideBySide(changes, file1, file2, opts) {
  const termWidth = (stdout.columns || 120);
  const col = Math.floor((termWidth - 5) / 2);

  function pad(s, len) {
    const plain = s.replace(/\x1b\[[0-9;]*m/g, '');
    const extra = s.length - plain.length;
    return s.padEnd(len + extra);
  }

  function truncate(s, len) {
    if (s.length <= len) return s;
    return s.slice(0, len - 3) + '...';
  }

  const header = pad(color(C.bold, `--- ${file1}`), col) + ' | ' + color(C.bold, `+++ ${file2}`);
  const sep = '─'.repeat(col) + '─┼─' + '─'.repeat(col);

  const lines = [header, sep];

  for (const ch of changes) {
    const p = ch.path || '(root)';
    if (ch.type === 'added') {
      if (opts.valuesOnly) continue;
      const left = pad(color(C.dim, p), col);
      const right = color(C.green, `+ ${truncate(formatValue(ch.to), col - 2)}`);
      lines.push(`${left} | ${right}`);
    } else if (ch.type === 'removed') {
      if (opts.valuesOnly) continue;
      const left = color(C.red, `- ${truncate(`[${p}] ${formatValue(ch.from)}`, col - 2)}`);
      const right = color(C.dim, '(absent)');
      lines.push(`${pad(left, col)} | ${right}`);
    } else if (ch.type === 'changed' || ch.type === 'type-change') {
      if (opts.keysOnly) continue;
      const left = color(C.red,   truncate(`${p}: ${formatValue(ch.from)}`, col));
      const right = color(C.green, truncate(`${p}: ${formatValue(ch.to)}`, col));
      lines.push(`${pad(left, col)} | ${right}`);
    }
  }

  return lines.join('\n');
}

function formatJson(changes, opts) {
  const filtered = changes.filter(ch => {
    if (opts.keysOnly && (ch.type === 'changed' || ch.type === 'type-change')) return false;
    if (opts.valuesOnly && (ch.type === 'added' || ch.type === 'removed')) return false;
    return true;
  });
  return JSON.stringify(filtered, null, 2);
}

// ─── Summary ─────────────────────────────────────────────────────────────────

function summarize(changes, opts) {
  let additions = 0, removals = 0, changed = 0;

  for (const ch of changes) {
    if (ch.type === 'added') additions++;
    else if (ch.type === 'removed') removals++;
    else if (ch.type === 'changed' || ch.type === 'type-change') changed++;
  }

  // Apply filters to count
  if (opts.valuesOnly) { additions = 0; removals = 0; }
  if (opts.keysOnly) { changed = 0; }

  const parts = [];
  if (additions > 0) parts.push(color(C.green, `${additions} addition${additions !== 1 ? 's' : ''}`));
  if (removals > 0)  parts.push(color(C.red,   `${removals} removal${removals !== 1 ? 's' : ''}`));
  if (changed > 0)   parts.push(color(C.yellow, `${changed} change${changed !== 1 ? 's' : ''}`));

  if (parts.length === 0) return color(C.dim, 'Files are identical');
  return parts.join(', ');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const opts = parseArgs(process.argv);
  useColor = opts.color;

  const [f1, f2] = opts.files;

  let rawA, rawB;
  try {
    rawA = readFileSync(resolve(f1), 'utf8');
  } catch (e) {
    fatal(`Cannot read file: ${f1} — ${e.message}`);
  }
  try {
    rawB = readFileSync(resolve(f2), 'utf8');
  } catch (e) {
    fatal(`Cannot read file: ${f2} — ${e.message}`);
  }

  let objA, objB;
  try {
    objA = JSON.parse(rawA);
  } catch (e) {
    fatal(`Invalid JSON in ${f1}: ${e.message}`);
  }
  try {
    objB = JSON.parse(rawB);
  } catch (e) {
    fatal(`Invalid JSON in ${f2}: ${e.message}`);
  }

  // Resolve --path
  if (opts.path) {
    objA = resolvePath(objA, opts.path);
    objB = resolvePath(objB, opts.path);
  }

  const changes = diff(objA, objB, '', opts.ignore);

  // Render output
  let output;
  switch (opts.output) {
    case 'unified':
      output = formatUnified(changes, f1, f2, opts);
      break;
    case 'side-by-side':
      output = formatSideBySide(changes, f1, f2, opts);
      break;
    case 'json':
      output = formatJson(changes, opts);
      break;
    default:
      output = formatTree(changes, opts);
  }

  if (output) console.log(output);

  // Summary line (not for json output)
  if (opts.output !== 'json') {
    console.log('\n' + color(C.bold, 'Summary: ') + summarize(changes, opts));
  }

  // Exit code for CI
  if (opts.exitCode && changes.length > 0) {
    process.exit(1);
  }
}

main();
