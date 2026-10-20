# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The bundled skill content tracks `obra/superpowers`; the synced upstream version
is recorded in `package.json` under `dsh.superpowersUpstream.tag` and repeated in
each release below.

## [Unreleased]

## [1.0.5] — 2026-10-20

Upstream skills unchanged (obra/superpowers **v6.4.2**).

**Adapted to DeepSeek Harness `v0.2.1-rc.2`** (verified against source
checkout `687f282e86`), whose shipped `standard` preset this one mirrors. The
0.2.1 line changed the delegation-row contract (first shipped in
`0.2.1-alpha.3`), so the old mirror broke every Superpowers session in the mode
from that release on; rc.2 is the target verified here.

### Fixed

- **The mode mounts again: `dsh-tool-subagent` no longer accepts `toolFilter`
  (or `persona`).** DSH 0.2.1 removed both config keys (the removal first
  shipped in `0.2.1-alpha.3`), and the plugin's `apply()` now throws when either
  is present:
  `tool-subagent: toolFilter is no longer supported; configure persona and tool
  plugins in an Agent Preset and select it with agentPreset (spawn only)`. The
  preset's `tool-subagent` and `tool-subagent-fork` rows still carried the
  `toolFilter.deny` filter that was valid through `0.2.1-alpha.2` and hid the
  reminder tools from children, so mounting the preset failed and the roster
  marked the whole mode broken
  (`agent preset superpowers: tool-subagent …`): a task could not be started in
  it at all. The child schedule-tool restriction that filter encoded has been
  enforced in the tool layer since `0.2.1-alpha.1` — `dsh-tool-schedule` refuses
  a delegated caller with `A delegated subagent cannot use reminders.` — so the
  filter had become redundant and the mirror drops it and follows Standard.
  Verified end to end by booting the profile from the rc.2 checkout and reading
  the live agent-preset roster: `superpowers` activates with no `broken`
  diagnostic, where the pre-fix build reported both delegation rows.
- **The shipped tool reference no longer claims `CLAUDE.md` is not auto-loaded.**
  `agent-instructions` has loaded `AGENTS.md` and `CLAUDE.md` — plus the
  `AGENTS.local.md` / `CLAUDE.local.md` overlays — in every directory from the
  project root down to the working directory, and `AGENTS.md` at both user roots
  (`$DSH_HOME`, `~/.agents`). The reference now describes that accurately,
  including the tool-layer rule that a delegated subagent cannot use the
  `schedule_*` tools (refused since `0.2.1-alpha.1`; the preset no longer filters
  the tools away).
- **The shipped tool reference was re-audited against the rc.2 checkout and
  corrected.** It named `wait_agent`, which only the optional Agent Teams bundle
  registers — the preset's delegation rows provide `send_message`,
  `interrupt_agent`, and `list_agents`; it claimed worktree tools do not exist at
  all, though an optional default-off Git Worktrees bundle adds
  `create_worktree`; it described every session record as carrying
  `{type, seq, time, data}`, though the first line is a header with no
  `seq`/`time`/`data` and a different field set; and it described one zstd frame
  per record, though frames follow durable write batches. It also called
  `workflow` the only place to pin a per-unit model (`subagent` takes the same
  overrides when the user enables model selection, which defaults off), put
  `render-graphs.js` under a `scripts/` directory that does not exist, and
  omitted that `workflow` too accepts `run_in_background`. The corrected text
  also records the default delegation cap of 1 (nested dispatch fails, and rc.2
  adds a depth note to the child's prompt), the model-selection setting and
  `list_subagent_models`, that `/name` need not be the whole prompt, and carries
  a "Verified against DSH 0.2.1-rc.2" stamp.

### Changed

- **The mirrored plugin list was refreshed from `standard` as of DSH
  `0.2.1-rc.2`.** The delegation group lost its two `toolFilter` blocks and
  Standard gained one row, `tool-plugin-market`
  (`@deepseek-ai/dsh-plugin-market/tools`, disabled). The parity snapshot now
  records `0.2.1-rc.2` (31 mirrored rows, 21 byte-identical blocks).
  `npm run sync:preset -- <dsh-root> --check` and `npm run verify` are green.
- `examples/profile-override.patch.yml` was re-copied from the refreshed preset,
  so the copy-pasteable override no longer pins the removed delegation config and
  carries the new `tool-plugin-market` row.
- `scripts/verify.mjs` now fails when a row mounting
  `@deepseek-ai/dsh-tool-subagent` sets `persona` or `toolFilter`. It checks the
  parsed entry list (quoted, spaced, and inline flow mappings included) rather
  than scanning the file, so a legitimate `persona:` key on another plugin row
  cannot trip it. The verifier also asserts the `tool-plugin-market` row by name
  **as a top-level row**, and compares the top-level row map with the snapshot in
  both directions: moving a mirrored row into a new group, or adding a top-level
  row the snapshot does not have, now fails instead of slipping past the
  flattened presence check. The snapshot is produced by the same script as the
  mirror, so these checks are independent of it.
- `scripts/verify.mjs` also fails when a file under `port/overrides/` drifts from
  its shipped copy under `skills/`. The sync script copies one over the other, but
  CI never runs it, so a fix applied to only one copy would otherwise ship
  instructions nobody reviewed.
- `scripts/sync-preset-from-dsh.mjs` now refuses a checkout that predates the
  target: it fails if the shipped standard preset still configures
  `persona`/`toolFilter` on a `tool-subagent` row or lacks the
  `tool-plugin-market` row (added in `0.2.1-alpha.4`), it requires
  `--accept-dsh-version` when the checkout's DSH version differs from the
  committed snapshot, and it refuses a path that does not report a DSH semantic
  version (an installed package directory is not a checkout). Pointing the script
  at the wrong checkout can no longer silently revert the mirror.
- The `using-git-worktrees` DSH text (the transform in
  `scripts/sync-from-upstream.mjs` and its generated copy) now says the optional,
  default-off Git Worktrees bundle adds `create_worktree`, instead of claiming no
  worktree tool exists. The `session-discovery.md` DSH section (transform and
  generated copy) now documents the actual header record, the project-slug escape
  rule, and a link base that resolves from the shipped file.
- The compatibility sections describe DSH's plugin gate correctly now: it reads
  an own `engines.dsh` range first and only otherwise checks `@deepseek-ai/dsh*`
  peer dependencies
  (`packages/boot/app-boot/src/plugin-compatibility.ts`). This package declares
  neither, so DSH neither blocks nor validates it; `npm run verify` remains the
  substitute. No `engines.dsh` was added: the composition is not tied to one DSH
  patch release, and a range would move the failure from `verify` to the
  installer for older and newer deployments alike.
- The README install sections warn about the old package alias: a profile that
  still depends on `superpowers-preset-dsh` and also installs
  `dsh-superpowers-preset` would select two bundle layers that both insert
  `preset-superpowers`. Remove the old alias first.
- `lib/skills.js`'s rank comment now states the real filesystem ranks (project
  100/200, custom 300, user 400/500, bundled 600): 550 means user and project
  skills win over the packaged catalog, while DSH's bundled skills lose to it.
- `docs/architecture.md` records the new guards and re-points its "presets own
  local discovery" citation at `packages/bundle/web-app/cordis.patch.yml:505-512`,
  which moved in the rc.2 checkout.
- `package.json` now pins the release the mirror targets in `dsh.verifiedDsh`,
  and `scripts/verify.mjs` fails when it disagrees with the parity snapshot, so
  a stale or hand-edited snapshot cannot claim a different release than the docs
  and the mirror name. The verifier also accepts `dsh.bundle.patch` as a string
  or an array (rc.2 allows both) while still requiring exactly one patch file.
  The compatibility tables now distinguish this package's Node floor (`>= 20`)
  from DSH `0.2.1-rc.2`'s own requirement (`^22.19.0` or `>=24`).
- Version references now name `0.2.1-rc.2`: both READMEs (badge, npm `latest`
  caveat, compatibility tables with checkout `687f282e86`), `docs/guide.en.md`,
  `docs/guide.zh.md`, the `session-discovery.md` generator in
  `scripts/sync-from-upstream.mjs`, and its generated copy. The cited source
  lines, `SESSION_FORMAT_VERSION` (4) and the transcript format were re-checked
  against the rc.2 checkout; the discovery text now also spells out that a
  current transcript is `session.v4.jsonl.zstd` and that a delegated child's
  directory is named by its bare session id, not `session-<uuid>`.

[1.0.5]: https://github.com/EdouardRichard/dsh-superpowers-preset/compare/v1.0.4...v1.0.5

## [1.0.4] — 2026-10-12

Upstream skills unchanged (obra/superpowers **v6.4.2**).

**Adapted to DeepSeek Harness `v0.2.1-alpha.2`** (verified against source
checkout `d7432673`), whose shipped `standard` preset this one mirrors. The
update changed both the persona contract and the delegation API, so the
adaptation is more than a version bump: it fixes a regression that broke every
Superpowers session in this mode, and it repairs the parts of the port that the
half-finished upgrade had left behind.

### Fixed

- **The persona suffix no longer references `{{cwd}}`.** DSH 0.2.1 replaced the
  standard preset's `suffix: Your working directory is {{cwd}}.` with the
  working-directory runtime context, and stopped registering `cwd` as a prompt
  variable: only `provider` and `model` are registered. A preset that still set
  that suffix failed every prompt assembly in the mode — new tasks and, because
  the preset is re-resolved when a session starts, resumed history too:
  `unknown prompt variable "{{cwd}}" in section "deployment:persona-suffix"`.
  The directory is still in the model's context, as
  `Current working directory: "<path>".`, supplied by
  `@deepseek-ai/dsh-working-directory`; the persona sentence was redundant.
- **The override example and the shipped tool reference no longer describe the
  `0.2.1-alpha.1` delegation API.** `examples/profile-override.patch.yml` had
  been migrated only halfway: the suffix was gone, but it still set the removed
  `backgroundMode: continuable` on both subagent rows, still mounted the removed
  `tool-subagent-codex`, `tool-subagent-claude-code`, and `tool-ralph` rows, and
  still carried the pre-alpha.2 plan-mode wording. The same release removed the
  `run_in_background` argument from `subagent` — every delegation now returns a
  child id and reports by completion notice — and added `cwd`, which
  `README.md`, `README.en.md`, and `using-superpowers/references/dsh-tools.md`
  still contradicted.

### Changed

- **The mirrored plugin list was refreshed from `standard` as of DSH
  `0.2.1-alpha.2`.** The same update reworded the plan-mode section, dropped the
  obsolete `backgroundMode` config from the two subagent rows, and removed the
  `tool-subagent-codex`, `tool-subagent-claude-code`, and `tool-ralph` rows.
  `npm run sync:preset -- <dsh-root> --check` and `npm run verify` are green
  again; the parity snapshot now records `0.2.1-alpha.2` (30 mirrored rows, 20
  byte-identical blocks).
- `scripts/verify.mjs` now fails if the preset or the override example carries a
  persona suffix or any `{{cwd}}` reference, and
  `scripts/sync-preset-from-dsh.mjs` fails if the shipped preset ever adds a
  suffix back, so the port has to make that decision deliberately.
- `scripts/lib/preset.mjs` treats `{{model}}` as the only allowed template group;
  `PERSONA_SUFFIX` is gone. `README.md`, `README.en.md`, and
  `docs/architecture.md` document the new suffix policy, and both READMEs'
  compatibility tables now name `0.2.1-alpha.2` as the verified DSH version.
- `scripts/verify.mjs` checks the override example with `collectRows()` and the
  same block digests the parity snapshot uses, instead of scanning for the
  ten-space indent. That scan saw only top-level rows, so the three removed rows
  and the obsolete config key survived undetected inside the `delegation` group;
  nested rows that the preset does not have, missing rows, and any row whose text
  has drifted from the preset now all fail the build.
- `npm test` ran `node --test scripts/tests/`, a directory that has never
  existed, so it always failed. It now runs the verifier — the same gate CI runs.
- Version references left over from the alpha.1 pass (`docs/guide.en.md`,
  `docs/guide.zh.md`, the `session-discovery.md` generator in
  `scripts/sync-from-upstream.mjs`, and its generated
  `skills/diagnosing-superpowers/references/session-discovery.md`) now name
  `0.2.1-alpha.2`. The cited source lines and `SESSION_FORMAT_VERSION` were
  re-checked against the alpha.2 checkout and are unchanged.

[1.0.4]: https://github.com/EdouardRichard/dsh-superpowers-preset/compare/v1.0.3...v1.0.4

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
