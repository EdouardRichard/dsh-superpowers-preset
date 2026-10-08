# Notices and third-party licenses

`dsh-superpowers-preset` is an independent, community-maintained port. It is not
affiliated with, endorsed by, or published by the Superpowers project or by
DeepSeek.

## Superpowers (upstream)

- Project: **Superpowers** — https://github.com/obra/superpowers
- Copyright: © 2025 Jesse Vincent and Superpowers contributors
- License: MIT
- Pinned version: **`v6.4.2`** (recorded in `package.json` under
  `dsh.superpowersUpstream`)

### What was taken from upstream

Only the **skill library** is derived from upstream:

| This repository | Upstream source | How it was changed |
|---|---|---|
| `skills/<name>/SKILL.md` | `skills/<name>/SKILL.md` | See *Adaptations* below. Structure and prose are upstream's; instructions that name tools, paths, subagents, or harness-specific mechanisms were rewritten for the DeepSeek Harness. |
| `skills/<name>/**` (scripts, prompts, references) | `skills/<name>/**` | Copied, with harness-neutral invocation fixes (see *Adaptations*). |
| `skills/using-superpowers/references/dsh-tools.md` | *(new file)* | Written for this port. Not from upstream. |

Nothing else is derived from upstream. The Cordis plugin
(`lib/index.js`), the agent-preset declaration (`cordis.patch.yml`), the
synchronisation and verification scripts (`scripts/`), and all documentation in
this repository are original work for this port.

### Adaptations applied by `scripts/sync-from-upstream.mjs`

The sync script is the authoritative list; it replays each adaptation as an
asserted string rewrite, so an upstream change that invalidates an adaptation
fails the sync instead of silently regressing. In summary:

1. Skill names lose the `superpowers:` namespace prefix (DSH addresses skills by
   bare name in kebab-case).
2. Harness-conditional instructions are collapsed to the DeepSeek Harness. The
   upstream "read your platform's `references/*-tools.md`" checklist for Claude
   Code, Codex, Gemini, Copilot, Pi, Antigravity, Hermes, and Muse is replaced
   by a single DSH reference; the other harness reference files are not
   distributed.
3. Claude Code tool names (`Task`, `TodoWrite`, `Bash`, `Read`, `Write`,
   `Edit`, `Glob`, `Grep`, `AskUserQuestion`, `WebSearch`, `WebFetch`) are
   replaced by their DeepSeek Harness equivalents (`subagent`, `todo_write`,
   `pwsh`/`bash`, `read`, `write`, `edit`, `glob`, `grep`,
   `ask_user_question`, `web_search`, `web_fetch`).
4. Named subagents (`superpowers:code-reviewer`) are replaced by the skills'
   own dispatch templates (`code-reviewer.md`, `implementer-prompt.md`, …)
   passed to the `subagent` tool, because DSH has no named-agent registry.
5. Claude Code paths are remapped to DSH paths: `~/.claude/skills/` →
   `$DSH_HOME/skills/`, `~/.superpowers/` → `$DSH_HOME/`.
6. Bundled helper scripts are invoked through their interpreter
   (`bash scripts/task-brief …`, `node render-graphs.js`) instead of as bare
   executables, because archive extraction and Windows do not preserve Unix
   executable bits.

### Upstream MIT license text

The MIT License under which the upstream skill content is distributed is
reproduced here in full, as the license requires:

```
MIT License

Copyright (c) 2025 Jesse Vincent

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## DeepSeek Harness

DeepSeek Harness (DSH) is the host this preset runs in. No DSH source code is
copied or redistributed here; the preset only references plugin package names
that ship with DSH (`@deepseek-ai/dsh-*`) and the documented Cordis composition
format. DSH is a separate project under its own license.
