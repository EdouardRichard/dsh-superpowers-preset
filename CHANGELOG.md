# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The bundled skill content tracks `obra/superpowers`; the synced upstream version
is recorded in `package.json` under `dsh.superpowersUpstream.tag` and repeated in
each release below.

## [1.0.0] — 2026-10-07

First release. Upstream skills synced from **obra/superpowers v6.4.2**.

### Added

- **The `superpowers` agent preset.** One `@deepseek-ai/dsh-agent-preset` row in
  `cordis.patch.yml`, carrying a self-sufficient working tool set, a persona, and
  the packaged skill provider.
- **Scoped skill registration.** `lib/skills.js` is mounted as
  `superpowers-preset-dsh/skills` inside the preset, so its 15 skill bundles land
  in the preset's own skill layer. Other modes never see them and pay no catalog
  tokens for them.
- **System-prompt bootstrap.** The body of `skills/using-superpowers/SKILL.md` is
  injected as the preset's persona, so the workflow rules are re-sent on every
  request and survive context compaction and history trimming.
- **15 ported skills** — brainstorming, diagnosing-superpowers,
  dispatching-parallel-agents, executing-plans, finishing-a-development-branch,
  receiving-code-review, requesting-code-review, subagent-driven-development,
  systematic-debugging, test-driven-development, using-git-worktrees,
  using-superpowers, verification-before-completion, writing-plans, writing-skills.
- **A DeepSeek Harness platform reference**
  (`skills/using-superpowers/references/dsh-tools.md`) replacing upstream's seven
  per-harness reference files: the Claude Code → DSH tool mapping, the DSH
  capabilities these skills use, the bundled-script rules, and the Windows notes.
- **Asserted upstream sync** (`scripts/sync-from-upstream.mjs`). Each DSH
  adaptation is a string rewrite with an expected match count; a changed anchor
  aborts the sync and leaves `skills/` untouched.
- **Bootstrap drift guard.** `scripts/sync-bootstrap.mjs` renders the persona text
  from the skill file, `scripts/sync-from-upstream.mjs` re-runs it, and
  `scripts/verify.mjs` fails when the two disagree.
- **Static verification** (`scripts/verify.mjs`) covering the bundle manifest, the
  preset declaration, the persona text, and every skill loaded through the real
  provider.
- **Bilingual documentation**: `README.md` / `README.en.md`, plus
  `docs/guide.zh.md` / `docs/guide.en.md` carrying the "mode details" and "how to
  use" panels that DSH does not render for third-party presets,
  `docs/architecture.md`, and `docs/plugin-vs-preset.md`.

### Notes

- Verified against DSH `0.2.1-alpha.1`. End-to-end: a task started in
  Superpowers mode has the bootstrap in its system prompt and the 15 skills in its
  catalog; the same task in Standard mode has neither.
- No runtime dependencies and no declared `@deepseek-ai/dsh*` peer dependencies,
  so DSH's plugin compatibility gate cannot block the bundle.
- `diagnosing-superpowers` documentation corrects a claim the earlier DSH port
  made: DSH does ship optional `SessionStart` hook bridges
  (`@deepseek-ai/dsh-hooks-claude-code`, `@deepseek-ai/dsh-hooks-codex`). This
  preset deliberately does not use them — a detached hook can miss the first
  request, while the persona cannot.

[1.0.0]: https://github.com/EdouardRichard/superpowers-preset-dsh/releases/tag/v1.0.0
