# Mago PHP Tools (VS Code Extension)

A Visual Studio Code extension that integrates **[mago](https://github.com/carthage-software/mago)** into your PHP workflow.

It provides **formatting**, **linting**, and **analysis** with accurate ranges, safe auto-fix support, and a dedicated **Analyze panel** similar to VS Code’s Problems / Source Control views.

---

## Features

### ✅ Format PHP (mago fmt)

* Supports:

  * **Format on Save**
  * **Format Document** command
  * **Right-click → Format Document**

---

### ✅ Lint PHP (mago lint)

* Supports:

  * On save linting
  * Manual lint command
* Diagnostics appear in:

  * Editor gutter
  * Problems panel
* Detects **safe fixes** from mago output

---

### ✅ Auto-Fix Support

* Safe fixes are detected from mago’s output

---

### ✅ Analyze View (mago analyze)

A dedicated **Analyze panel** (Activity Bar view), similar to Source Control:

* Groups issues **by file**
* Files are displayed **relative to mago root**

#### Badges

  * `E` = Error
  * `W` = Warning
  * `I` = Info / Note
  * `H` = Help
  * `E*`, `W*`, etc. = safe fix available

---

## Configuration

```json
{
  "magoPhpTools.magoPath": "mago",
  "magoPhpTools.formatOnSave": true,
  "magoPhpTools.lintOnSave": true
}
```

| Setting                     | Description               |
| --------------------------- | ------------------------- |
| `magoPhpTools.magoPath`     | Path to the `mago` binary |
| `magoPhpTools.formatOnSave` | Format PHP files on save  |
| `magoPhpTools.lintOnSave`   | Lint PHP files on save    |

---

## How mago Root Is Resolved

For every operation (format / lint / analyze):

1. Start from the current file’s directory
2. Walk up parent folders
3. Stop at the first folder containing `mago.toml`
4. Run mago with that folder as `cwd`

This allows:

* Monorepos
* Nested PHP projects
* Multiple mago configs in one workspace

---

## Supported File Types

* `.php`

---

## Requirements

* `mago` installed and accessible in `PATH`
* PHP project with `mago.toml`

---

## License

MIT
