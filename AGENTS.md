# AGENTS.md

mother is a vscode extension that lets you use open weights prediction models with vscode as inline completions.

## Context handling
- Context window: fixed size of 10 lines above + cursor line + 10 lines below.
- Context includes:
  - Current file window (original + current windows)
  - Recent diffs (captured from document changes)
  - Recent files (captured from opened/edited documents)
- Prompt format follows Sweep’s `run_model.py` structure:
  - `<|file_sep|>` file blocks
  - `.diff` blocks with `original:` / `updated:`
  - `original/<file>`, `current/<file>`, `updated/<file>`
- Context budgeting: approximate 4 chars = 1 token; default 8192 tokens (32768 chars). Oldest files/diffs are dropped to fit.
- If the current file is too large, a warning notification is shown and no request is sent.

## Status bar
- Status bar item label: `mother` (with icon).
- Priority places it near the right side (not the far-right edge).
- Visual states:
  - Loading: spinner icon
  - Error: red background with error icon
  - Disabled: yellow background with slash icon
- The item opens a QuickPick menu (command palette style) with:
  - Disable/Enable globally
  - Disable/Enable for current language

## Enable/disable logic
- Enabled by default.
- Global enable/disable stored in `mother.enabled`.
- Language disable list stored in `mother.disabledLanguages`.
- Inline completions are skipped if:
  - globally disabled
  - current language disabled
  - missing endpoint/model
  - context insufficient or file too large

## Error handling
- Errors update the status bar (red state) and log to Output channel.
- HTTP or request failures also show a warning notification.
- `chat.disableAIFeatures` is checked on startup and on config change; if true:
  - a warning notification is shown
  - status bar enters an error state

## Files of interest
- `src/extension.ts`: VS Code hooks, commands, inline completion provider, config handling.
- `src/context.ts`: tracks recent edits/files and builds context windows.
- `src/model.ts`: prompt formatting and model API calls.
- `src/statusbar.ts`: status bar state + visuals.

## Settings (partial)
- `mother.enabled` (bool)
- `mother.disabledLanguages` (string[])
- `mother.endpoint` (string)
- `mother.model` (string)
- `mother.maxContextChars` (number)
- `mother.maxRecentDiffs` (number)
- `mother.maxRecentFiles` (number)
- `mother.maxCurrentFileChars` (number)

## Notes
- Inline suggestions require `editor.inlineSuggest.enabled = true`.
- VS Code’s `chat.disableAIFeatures` disables inline completions; the extension should detect and surface this.
