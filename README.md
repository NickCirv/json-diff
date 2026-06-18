<div align="center">

# json-diff

**Spot exactly what changed between two JSON files — tree, unified, side-by-side, or machine-readable output**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue?labelColor=0B0A09)](LICENSE)
[![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen?labelColor=0B0A09)](package.json)
[![Node >=18](https://img.shields.io/badge/node-%3E%3D18-blue?labelColor=0B0A09)](package.json)

</div>

## Install

```bash
npx github:NickCirv/json-diff a.json b.json
```

## Usage

```bash
json-diff <file1.json> <file2.json> [options]
jdiff     <file1.json> <file2.json> [options]
```

| Flag | Description |
|------|-------------|
| `--output <format>` | `tree` (default), `unified`, `side-by-side`, `json` |
| `--path <jsonpath>` | Compare at a specific JSON path, e.g. `"users[0].address"` |
| `--ignore <path>` | Ignore a path in diff (repeatable) |
| `--exit-code` | Exit 1 if files differ — CI-friendly |
| `--keys-only` | Show only added/removed keys, not value changes |
| `--values-only` | Show only value changes, not structural changes |
| `--no-color` | Disable ANSI color output |
| `-v, --version` | Show version |

## What it does

Recursively walks two JSON files and reports every addition (`+`), removal (`-`), and value change (`~`) as a full dot-bracket path. Arrays are diffed with an LCS algorithm that matches objects by identity keys (`id`, `name`, `email`, etc.) so array reorders produce granular nested diffs instead of wholesale add/remove. Four output formats cover human review, code-review workflows, terminal side-by-side, and JSON piping.

```
~ version: "1.0.0" → "2.0.0"
+ timeout: 30
~ users[0].email: "alice@example.com" → "alice@newdomain.com"
- users[1]: {"id":2,"name":"Bob",...}
+ users[1]: {"id":3,"name":"Charlie",...}
- meta.deprecated: true

Summary: 6 additions, 3 removals, 7 changes
```

---
<sub>Zero dependencies · Node >=18 · MIT · by <a href="https://github.com/NickCirv">NickCirv</a></sub>
