# Parity with the Standard preset

The goal of this package is narrow and testable: **be the shipped Standard
preset, plus Superpowers.** Not "similar to Standard" — the same preset, with two
additions.

This page states exactly what is identical, what was added, and what is
different only because DSH treats third-party presets differently. Everything in
the first two sections is enforced by `npm run verify`.

## 1. The guarantee, and how it is checked

| Check | What it proves |
| --- | --- |
| `preset/standard-parity.json` → `rows` | every row the shipped preset carries is still mounted here, by id and module |
| `preset/standard-parity.json` → `blocks` | each top-level row's **whole text** is byte-identical: config values, `isolate` maps, `disabled` expressions, and every nested row |
| `persona` identity assertion in `scripts/sync-preset-from-dsh.mjs` | this preset's persona still starts from Standard's exact identity line and working-directory suffix |

A top-level "block" is a row plus its entire subtree, so a change anywhere —
`tool-web.searchTimeoutMs`, the plan-mode section prose, a nested
`disabled: !!js …`, a group's `isolate:` map — changes that block's digest and
fails the build. Both the mirror script and the verifier read rows through one
shared implementation (`scripts/lib/rows.mjs`), because two slightly different
scanners would produce false failures, and a false failure is how a real check
gets deleted.

Snapshot provenance is recorded in the file: `dshVersion` plus the source path
(`packages/bundle/web-app/presets/standard.patch.yml`).

## 2. What this preset adds

Only two rows differ from Standard:

| Addition | Detail |
| --- | --- |
| `persona.prefix` | Standard's identity line, then the body of `skills/using-superpowers/SKILL.md`. Standard's `suffix` is unchanged. |
| `superpowers-skills` | `superpowers-preset-dsh/skills`, mounted **inside** this preset, registering the 15 packaged skills into this preset's skill layer only. |

Nothing else. All 33 other rows — including `skill-filesystem`, the whole
`planning`, `compaction`, and `delegation` groups, and the four rows Standard
ships disabled — are copied byte for byte.

## 3. What differs because it is a third-party preset

These are properties of any preset DSH did not ship. They cannot be changed from
a bundle, and a user should know them before choosing this mode.

| Aspect | Standard | Superpowers | Why |
| --- | --- | --- | --- |
| Roster group | 内置 (Built-in) | 自定义 (Custom) | `isBuiltInPreset` requires a row that publishes **no** `name` **and** has an id in the shipped four (`agent-preset-registry/src/display.ts:53-55`) |
| Name and description | localized from DSH's own dictionaries | literal strings from the declaration | `presetDisplayText` translates shipped ids only, so switching the UI language does not translate this card |
| 模式说明 / 如何使用 buttons | present | absent — only 查看配置 | the help lookup returns `undefined` for `trust !== 'system'` (`ui-agent-preset/.../PresetGuideDialog.tsx:32-34`); the content ships as [docs/guide.zh.md](guide.zh.md) instead |
| New-task default | yes (`agent-preset-registry.config.default: standard`) | no | a new task starts in Standard until you pick Superpowers, or press 「设为新任务默认」 for it |
| Roster position | `order: 1` | `order: 10` | after the four shipped modes |

Two DSH code paths do mention `standard` by name and neither touches this
preset:

- `ui-agent-preset/src/client/settings-store.ts` — `requiresCodingTools()` is
  true only for the built-in `ptc` and `minimal`, so the "Coding Tools"
  preference never hides or resets this mode.
- `ui-agent-preset/src/client/section-store.ts:85-99` —
  `reconcileCodingTools()` only rewrites the default when the **current default**
  requires coding tools. It cannot fire while this preset is selected.

## 4. What differs in effect, not in composition

The composition is the same; the session is not, because a preset also decides
what its agent sees.

**The skill catalog is Standard's, plus fifteen.** Both modes mount
`skill-filesystem` with default settings, so both discover the same local roots
(`<project>/.dsh/skills`, `<project>/.agents/skills`, `$DSH_HOME/skills`,
`~/.agents/skills`, the bundled root). This mode adds the packaged Superpowers
skills on top.

**A local skill with the same name wins.** Both providers register into the
*same* preset layer, and within one layer the registry resolves duplicate names
by rank (`skill/src/index.ts:551-582`). Local roots rank 100–500; the packaged
Superpowers provider ranks 550; the bundled root ranks 600. Lower wins. So a
skill you write called `brainstorming` or `test-driven-development` shadows the
packaged one inside this mode, and DSH logs a warning. That is deliberate — it
keeps user skills authoritative, exactly as they are in Standard — but it means
"15 skills" describes what is shipped, not necessarily what is loaded.

**The prompt is bigger, in this mode only.** Measured on the machine this port
was developed on, with one user skill installed:

| | Standard | Superpowers |
| --- | --- | --- |
| System prompt | 6130 chars | 9878 chars (the bootstrap adds ~3.7 KB every request) |
| Skill catalog | 2559 chars, 2 skills | 8356 chars, 17 skills = those 2 + the 15 |

Both costs are scoped to tasks started in this mode. That is the entire reason
this package is a preset rather than a host plugin.

## 5. What was deliberately not done

- **The shipped `standard` preset is untouched.** This bundle inserts its own
  row; it does not override, rename, or extend `preset-standard`. Installing it
  changes no existing session's behaviour.
- **The new-task default is left alone.** Making Superpowers the default would
  put the bootstrap into every new task, which is the thing this package exists
  to avoid. Choose it per task, or set it as the default yourself in
  Settings → Agent presets.
- **No hook bundles.** DSH ships optional `SessionStart` bridges; this preset
  does not use them. A detached hook can miss the first request, while the
  persona cannot be lost at all.

## 6. Re-checking after a DSH upgrade

```sh
git clone --depth 1 https://github.com/deepseek-ai/deepseek-harness   # or use your checkout
npm run sync:preset -- ./deepseek-harness --check    # report drift, change nothing
npm run sync:preset -- ./deepseek-harness            # re-mirror, then review the diff
npm run verify
```

`--check` exits non-zero when the mirror is stale, so it can gate a release.
The sync also fails loudly — rather than silently shipping an older identity —
if DSH rewords the persona line or suffix this port is built on.
