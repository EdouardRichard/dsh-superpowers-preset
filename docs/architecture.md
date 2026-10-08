# Architecture

This package is a **bundle**: a normal npm package whose `package.json` declares a
Cordis patch file, and whose patch declares one agent preset. Installing the
bundle adds a selectable mode to DSH. Nothing in it touches the host layer, so
installing it changes no existing session's behaviour.

```
dsh-superpowers-preset/
├── package.json          dsh.bundle.patch → cordis.patch.yml
├── cordis.patch.yml      the whole installation: one preset declaration
├── lib/
│   ├── index.js          host half: deliberately empty (see below)
│   └── skills.js         the scoped skill provider
├── skills/               15 skill bundles, ported from obra/superpowers
├── port/
│   ├── overrides/        DSH-only files laid over the synced tree
│   └── (see scripts/)    adaptations live in the sync script, asserted
└── scripts/
    ├── sync-from-upstream.mjs   rebuild skills/ from an upstream checkout
    ├── sync-bootstrap.mjs       keep the persona prefix in step with the skill
    ├── verify.mjs               the CI gate
    └── lib/preset.mjs           shared bootstrap plumbing
```

## What the patch inserts

`cordis.patch.yml` inserts a single `@deepseek-ai/dsh-agent-preset` row. Its
`config.plugins` list is the complete composition of one Superpowers session:

| Row | Why it is there |
| --- | --- |
| `persona` | Carries the bootstrap. `dsh-persona` registers it as this scope's `deployment:persona-prefix` section, shadowing the deployment default. |
| `dsh-superpowers-preset/skills` | Registers the packaged skill catalog into this preset's skill layer. |
| `skill-filesystem` | The **local** skill provider: project `.dsh/skills` and `.agents/skills`, user `$DSH_HOME/skills` and `~/.agents/skills`. |
| `tool-skill` | Renders the catalog and provides the `skill` loader. |
| `agent-instructions`, `time-context` | `AGENTS.md` loading and the runtime clock, matching the shipped Standard preset. |
| everything else | Terminal, fs, search, jobs, schedule, goal, plan mode, compaction, delegation, ask-user, todo, web, present — the working tool set, copied from Standard. |

## The plugin list is Standard's, and that is enforced

`skill-filesystem` deserves its own note, because it is the row whose absence is
easiest to miss and worst to miss.

DSH keeps the `skills` **registry** on the host plane but moves **discovery**
behind presets: the base `skill-filesystem` row is disabled at the host layer,
with the shipped patch explaining that "presets own local discovery"
(`packages/bundle/web-app/cordis.patch.yml:493-503`). So a preset that does not
mount its own copy has no filesystem provider at all — its agent sees the
packaged catalog and silently loses every skill the user has written, in the
project or in `$DSH_HOME/skills`.

Because that class of loss is invisible, it is guarded three ways:

1. **The list is mirrored, not hand-written.**
   `scripts/sync-preset-from-dsh.mjs <dsh-root>` rebuilds the plugin list from
   the shipped `standard` preset, keeping only this package's two own rows: the
   persona and the Superpowers provider. Everything else is copied byte for
   byte. Run it after every DSH upgrade.
2. **A committed snapshot gates the build.** `preset/standard-parity.json`
   records every row the shipped preset carries (id, module, and whether
   Standard disables it) *plus a sha256 per top-level row block*. `npm run
   verify` fails if this preset stops mounting a row **or** if a mirrored row's
   config, `isolate` map, `disabled` expression, or nested rows were edited. The
   persona identity line and suffix are asserted the same way.
3. **The failure mode is named in the diagnostic**, so the next person to hit it
   reads *why* a missing row is a missing capability rather than deleting the
   check.

The result is that this preset is **Standard plus Superpowers**, not a separate
composition that happens to look similar.

Three differences remain, and none of them can be changed from a bundle: DSH
files this preset under the **custom** roster group rather than built-in
(`isBuiltInPreset` accepts only a row that publishes no `name` whose id is one of
the shipped four), its name and description are **literal** strings rather than
localized ones, and it is **not the new-task default**
(`agent-preset-registry.config.default: standard`). The README states them for
users.

## Why the bootstrap is a persona, not a message

Upstream Superpowers injects `using-superpowers` at session start. That is the
right shape when the only available channel is a hook that appends conversation
context.

A DSH agent preset has a better channel: `dsh-persona` writes into the **system
prompt**, which the harness rebuilds for every request from the preset's
composition. Three consequences:

1. **It cannot be compacted away.** Compaction and history trimming act on the
   conversation; the persona is not in the conversation.
2. **It is present on the first request**, not raced against it. (DSH's optional
   `dsh-hooks-claude-code` bridge runs `SessionStart` detached and documents that
   its context can miss the first request.)
3. **It is scoped.** The only sessions that pay for those tokens are the ones
   that chose this mode.

The bootstrap text is not written twice. `skills/using-superpowers/SKILL.md` is
the source of truth; `scripts/sync-bootstrap.mjs` renders the persona prefix from
it, `scripts/sync-from-upstream.mjs` re-renders it after every upstream sync, and
`scripts/verify.mjs` fails the build if the two ever disagree.

## Why the provider is a subpath, not the package root

`package.json` exports the provider at `dsh-superpowers-preset/skills`, and the
preset mounts it by that specifier. The package root (`lib/index.js`) is a
different module and does nothing on the host side.

The split exists because **placement determines scope**. If the provider were
mounted as a host row — the obvious thing to do, and what a plugin-shaped port
does — `registerProvider()` would file it into the global layer, and the
Superpowers catalog would appear in every session's system prompt. That is
precisely the behaviour this package exists to avoid. Mounting it as
`dsh-superpowers-preset/skills` inside the preset's composition files it into the
preset's own layer instead.

The root export is kept for the browser half (see below), which needs a loader
row; that row needs an `apply`, and the `apply` must not touch the host.

## Version and dependency posture

- **No runtime dependencies.** `lib/` imports only Node built-ins. The provider
  cannot drift with the profile's dependency tree, and no build step is needed.
- **No `@deepseek-ai/dsh*` peer dependencies.** DSH's plugin compatibility gate
  checks only the peer dependencies a plugin declares; declaring none keeps the
  bundle loadable across DSH releases, at the cost of DSH not validating it for
  you. `scripts/verify.mjs` is the substitute.
- **Every harness plugin it names is one DSH ships.** The patch references
  `@deepseek-ai/dsh-*` packages and `cordis:group`; `verify.mjs` rejects any
  other specifier.

## How the skill tree is maintained

`skills/` is a **generated** tree. Do not hand-edit it.

```bash
# 1. fetch the pinned upstream checkout
mkdir -p .upstream && curl -L \
  https://codeload.github.com/obra/superpowers/tar.gz/refs/tags/v6.4.2 \
  | tar -xz -C .upstream --strip-components=1

# 2. replay the port
npm run sync -- .upstream

# 3. gate it
npm run verify
```

## How the preset stays aligned with DSH

`cordis.patch.yml` is a **mirrored** file. Do not hand-edit the block below the
`everything below mirrors` marker either.

```bash
# After upgrading DSH, against the new source checkout or installation:
npm run sync:preset -- /path/to/deepseek-harness

# Review the diff, then confirm nothing drifted:
npm run sync:preset -- /path/to/deepseek-harness --check
npm run verify
```

The mirror keeps the persona and the Superpowers provider verbatim and replaces
everything else with the shipped Standard list.

`scripts/sync-from-upstream.mjs` copies the upstream tree into a staging
directory, applies the asserted rewrites, strips the `superpowers:` namespace
prefix, overlays `port/overrides/`, re-renders the persona prefix, and only then
swaps the result into place. A missing anchor aborts the run and leaves the
previous tree untouched, so an upstream rewrite can never silently drop a DSH
adaptation. The adaptations themselves are documented in
[NOTICE.md](../NOTICE.md).

## Verification

`npm run verify` checks, without installing anything:

1. the bundle manifest and the `./skills` export resolve;
2. the preset declaration has an id, name, description, order, a non-empty plugin
   list, and only resolvable plugin specifiers;
3. the skill provider is mounted inside the preset and **not** as a host row;
4. every row the shipped `standard` preset carries is still mounted here;
5. the persona prefix equals the identity line plus the current
   `using-superpowers` body, with no `{{…}}` group `dsh-persona` would reject;
6. every skill bundle lists, loads, and resolves its resource base through the
   real provider, with duplicate names and dangling relative links reported.

End-to-end verification (install into a throwaway profile, start a task in each
mode, and diff the transcripts) is described in
[README.md § 验证](../README.md#验证).
