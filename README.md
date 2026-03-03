# json-diff

Diff two JSON files and show structural differences clearly. Zero external dependencies — built-in Node.js modules only.

```
npm install -g @nickcirv/json-diff   # coming soon
npx json-diff a.json b.json
```

Or clone and run directly:

```bash
git clone https://github.com/NickCirv/json-diff.git
cd json-diff
chmod +x index.js
./index.js a.json b.json
```

---

## Usage

```
json-diff <file1.json> <file2.json> [options]
jdiff <file1.json> <file2.json> [options]
```

### Options

| Flag | Description |
|------|-------------|
| `--path <jsonpath>` | Compare at a specific JSON path (e.g. `"users[0].address"`) |
| `--ignore <path>` | Ignore a path in diff (repeatable) |
| `--output <format>` | Output format: `tree` (default), `unified`, `side-by-side`, `json` |
| `--no-color` | Disable color output |
| `--exit-code` | Exit with code 1 if files differ (CI-friendly) |
| `--keys-only` | Only show added/removed keys, not value changes |
| `--values-only` | Only show value changes, not structural changes |
| `-h, --help` | Show help |
| `-v, --version` | Show version |

---

## Output Formats

### tree (default)

Color-coded indented diff with `+` / `-` / `~` prefixes and full JSON paths.

```
~ version: "1.0.0" → "2.0.0"
~ debug: true → false
~ users[0].email: "alice@example.com" → "alice@newdomain.com"
~ users[0].address.city: "London" → "Manchester"
+ users[0].address.postcode: "M1 1AE"
- users[1]: {"id":2,"name":"Bob",...}
+ users[1]: {"id":3,"name":"Charlie",...}
+ features[3]: "webhooks"
- meta.deprecated: true

Summary: 6 additions, 3 removals, 7 changes
```

### unified

Standard unified diff style (`--- +++ @@`), familiar for code review workflows.

```
--- a.json
+++ b.json
@@ structural diff @@
- [version] "1.0.0"
+ [version] "2.0.0"
- [users[0].email] "alice@example.com"
+ [users[0].email] "alice@newdomain.com"
```

### side-by-side

Two-column layout truncated to terminal width.

```
--- a.json                            | +++ b.json
──────────────────────────────────────┼──────────────────────────────────────
version: "1.0.0"                      | version: "2.0.0"
users[0].email: "alice@example.com"   | users[0].email: "alice@newdomain.com"
```

### json

Machine-readable array of change objects — ideal for piping into other tools.

```json
[
  {
    "path": "version",
    "type": "changed",
    "from": "1.0.0",
    "to": "2.0.0"
  },
  {
    "path": "users[0].email",
    "type": "changed",
    "from": "alice@example.com",
    "to": "alice@newdomain.com"
  },
  {
    "path": "users[0].address.postcode",
    "type": "added",
    "from": null,
    "to": "M1 1AE"
  }
]
```

---

## Examples

```bash
# Basic diff
json-diff a.json b.json

# Compare only at a specific path
json-diff a.json b.json --path "users[0].address"

# Ignore timestamps when diffing
json-diff a.json b.json --ignore "meta.createdAt" --ignore "meta.updatedAt"

# Machine-readable output for CI pipelines
json-diff a.json b.json --output json | jq '.[].path'

# CI gate — exits 1 if files differ
json-diff expected.json actual.json --exit-code

# Only show structural changes (added/removed keys)
json-diff a.json b.json --keys-only

# Only show value changes, not additions/removals
json-diff a.json b.json --values-only

# Plain text (no ANSI codes)
json-diff a.json b.json --no-color
```

---

## Diff Algorithm

- **Objects**: deep recursive key comparison — detects added keys, removed keys, type changes, value changes
- **Arrays**: LCS (Longest Common Subsequence) diff with identity heuristics — objects sharing `id`, `key`, `name`, `slug`, `uuid`, or `email` fields are matched across the array even if other fields differ, enabling granular nested diffs instead of wholesale replaced/added
- **Primitives**: direct equality with type awareness
- **Paths**: all changes reported as full dot-bracket JSON paths (`users[0].address.city`)

---

## Color Coding

| Symbol | Color | Meaning |
|--------|-------|---------|
| `+` | Green | Added |
| `-` | Red | Removed |
| `~` | Yellow | Changed (shows old → new) |
| path | Cyan | JSON path context |

---

## Requirements

- Node.js >= 18
- Zero external dependencies

---

## License

MIT
