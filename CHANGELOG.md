# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The bundled skill content tracks `obra/superpowers`; the synced upstream version
is recorded in `package.json` under `dsh.superpowersUpstream.tag` and repeated in
each release below.

## [Unreleased]

Upstream skills unchanged (obra/superpowers **v6.4.2**).

## [1.0.3] — 2026-10-08

Upstream skills unchanged (obra/superpowers **v6.4.2**).

**The project is now `dsh-superpowers-preset`.** The repository was renamed, and
every reference in the package followed. Nothing else changed: the preset, its
skills, and its runtime behaviour are identical to 1.0.2.

### Changed

- `package.json`'s `name`, `homepage`, `repository`, and `bugs` now say
  `dsh-superpowers-preset`, as do the attribution lines in `LICENSE` and
  `NOTICE.md`.
- The bundle patch mounts the provider as **`dsh-superpowers-preset/skills`**,
  and `scripts/verify.mjs` asserts that name: it fails the build if the declared
  package name, the mounted specifier, or the host-row leak check drift apart.
  `docs/architecture.md`, both READMEs, and
  `examples/profile-override.patch.yml` follow the new name.
- **An existing install has to be reinstalled.** The profile recorded the old
  package name, so `dsh plugin --profile <profile> remove superpowers-preset-dsh`
  no longer matches. Install the new one with
  `dsh plugin --profile <profile> add github:EdouardRichard/dsh-superpowers-preset`,
  or `add ./dsh-superpowers-preset` from a fresh checkout. GitHub redirects the
  old repository URL, so the old install line still resolves — but the recorded
  name would not match this release.

### Fixed

- **`CHANGELOG.md` labels 1.0.2 correctly.** Those notes shipped in `v1.0.2` but
  sat under an `[Unreleased]` heading, which also left the `[1.0.2]` link
  reference unused.

[1.0.3]: https://github.com/EdouardRichard/dsh-superpowers-preset/releases/tag/v1.0.3

## [1.0.2] — 2026-10-07

No change to what the preset mounts or to any user-facing behaviour: this release
strengthens the guarantees around the 1.0.1 fix and folds the difference
documentation into the READMEs.

### Added

- **Byte-level parity with the shipped Standard preset.**
  `preset/standard-parity.json` now records a sha256 for every top-level row
  block of `packages/bundle/web-app/presets/standard.patch.yml`, and
  `npm run verify` fails when a mirrored row's config, `isolate` map,
  `disabled` expression, or nested rows were edited by hand. Presence alone was
  not enough: the guarantee is "Standard plus Superpowers", not "a preset that
  mounts the same row ids". Negative-tested against both a config edit
  (`tool-web.searchTimeoutMs`) and a nested edit (the plan-mode section prose).
- **Persona identity assertion.** `sync-preset-from-dsh.mjs` now fails when the
  shipped preset rewords its persona identity line or working-directory suffix,
  instead of silently shipping an older identity.
- **`scripts/lib/rows.mjs`**, one shared row/block reader for the mirror script
  and the verifier — two scanners would produce false parity failures.
- **A "differences from Standard" section in both READMEs**, covering the three
  inherent third-party-preset differences (custom roster group, unlocalized name
  and description, not the new-task default) and the two behavioural ones
  (local skills win a name collision; the prompt is larger in this mode only).

### Changed

- `npm run verify` reports block digests and the DSH version the snapshot came
  from, so a stale mirror is visible in the output rather than inferred.

[1.0.2]: https://github.com/EdouardRichard/dsh-superpowers-preset/compare/v1.0.1...v1.0.2

## [1.0.1] — 2026-10-07

Upstream skills unchanged (obra/superpowers **v6.4.2**).

### Fixed

- **The preset no longer drops local skill discovery.** `1.0.0` omitted
  `skill-filesystem` from its plugin list. DSH disables that row at the host
  layer and lets each agent preset mount its own copy — "presets own local
  discovery" (`packages/bundle/web-app/cordis.patch.yml:493-503`) — so the mode
  had no filesystem provider at all. Project skills (`.dsh/skills`,
  `.agents/skills`), user skills (`$DSH_HOME/skills`, `~/.agents/skills`), and
  the bundled root were all missing from the catalog, with no error to explain
  it. A Superpowers task now sees everything a Standard task sees, plus the 15
  Superpowers skills.

### Added

- **The plugin list is mirrored from the shipped `standard` preset.**
  `scripts/sync-preset-from-dsh.mjs <dsh-checkout>` rebuilds it from
  `packages/bundle/web-app/presets/standard.patch.yml`, keeping only this
  package's own two rows (the persona and the Superpowers provider) and copying
  the rest byte for byte. `--check` reports drift without writing.
- **`preset/standard-parity.json`**, a committed snapshot of every row the
  shipped preset carries, and a `npm run verify` check that fails when this
  preset stops mounting one. A missing row is a missing capability, so it should
  never be a silent diff.
- The override example is regenerated from the mirrored list and now carries
  `skill-filesystem` too.

[1.0.1]: https://github.com/EdouardRichard/dsh-superpowers-preset/releases/tag/v1.0.1

## [1.0.0] — 2026-10-07

First release. Upstream skills synced from **obra/superpowers v6.4.2**.

### Added

- **The `superpowers` agent preset.** One `@deepseek-ai/dsh-agent-preset` row in
  `cordis.patch.yml`, carrying a self-sufficient working tool set, a persona, and
  the packaged skill provider.
- **Scoped skill registration.** `lib/skills.js` is mounted as
  `dsh-superpowers-preset/skills` inside the preset, so its 15 skill bundles land
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

[1.0.0]: https://github.com/EdouardRichard/dsh-superpowers-preset/releases/tag/v1.0.0
