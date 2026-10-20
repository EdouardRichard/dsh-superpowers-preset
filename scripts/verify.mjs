#!/usr/bin/env node
/**
 * Verify the shipped preset without installing it.
 *
 * `npm run verify` is the gate CI runs on every push. It checks the four things
 * that can silently break a bundle install:
 *
 *   1. **The bundle manifest resolves.** `dsh.bundle.patch` points at a file
 *      that exists, and the package exports the subpath the patch mounts.
 *   2. **The preset declaration is well-formed.** One `@deepseek-ai/dsh-agent-preset`
 *      row with the expected id, a non-empty plugin list, and every plugin
 *      specifier either a harness-shipped package, a Cordis primitive, or a
 *      subpath of this package.
 *   3. **The bootstrap has not drifted.** The `persona.prefix` in
 *      `cordis.patch.yml` must equal the identity line plus the current body of
 *      `skills/using-superpowers/SKILL.md`, and must contain no `{{…}}` group
 *      that `dsh-persona` would fail to resolve.
 *   4. **Every skill loads through the real provider.** Each bundle is parsed
 *      from disk, listed, and read back through `lib/skills.js` exactly as the
 *      harness would, with duplicate names and dangling relative links reported.
 *
 * @module scripts/verify
 */

import { readFile, readdir, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { blockDigest, collectRows, directConfigKeys, rowBlocks, topLevelBlocks } from './lib/rows.mjs'
import {
  IDENTITY,
  PRESET_ID,
  PRESET_ROW_ID,
  assertNoTemplateGroups,
  readPrefixFromPatch,
  readSkillBody,
  renderPrefix,
} from './lib/preset.mjs'

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const problems = []
const notes = []

/** Record a failed check. */
function fail(message) {
  problems.push(message)
}

/** Record a passing check with detail. */
function ok(message) {
  notes.push(message)
}

/** Read and JSON-parse a package file. */
async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

// ---------------------------------------------------------------- manifest --

const pkg = await readJson(join(pkgRoot, 'package.json'))

if (pkg.name !== 'dsh-superpowers-preset') fail(`package.json name is "${pkg.name}", expected "dsh-superpowers-preset"`)
if (pkg.license !== 'MIT') fail(`package.json license is "${pkg.license}", expected "MIT"`)

// rc.2 accepts `dsh.bundle.patch` as a string or an ordered array. This package
// ships one patch (the whole installation); accept both shapes but keep the
// downstream checks anchored on exactly one file.
const declaredPatch = pkg.dsh?.bundle?.patch
const patchRels = typeof declaredPatch === 'string'
  ? [declaredPatch]
  : Array.isArray(declaredPatch) ? declaredPatch : undefined
if (patchRels === undefined || patchRels.length === 0) {
  fail('package.json declares no dsh.bundle.patch — the profile would install the package but mount nothing')
} else if (patchRels.some(rel => typeof rel !== 'string')) {
  fail('dsh.bundle.patch must contain only file paths')
} else if (patchRels.length > 1) {
  fail(
    `dsh.bundle.patch declares ${patchRels.length} files; this verifier reads one. ` +
    'Extend scripts/verify.mjs deliberately before shipping several bundle patches.',
  )
} else if (!(await stat(join(pkgRoot, patchRels[0])).catch(() => null))?.isFile()) {
  fail(`dsh.bundle.patch points at "${patchRels[0]}", which does not exist`)
} else {
  ok(`bundle patch: ${patchRels[0]}`)
}
const patchRel = patchRels[0]

if (typeof pkg.exports?.['./skills'] !== 'string') {
  fail('package.json exports no "./skills" subpath; the preset mounts dsh-superpowers-preset/skills')
} else if (!(await stat(join(pkgRoot, pkg.exports['./skills'])).catch(() => null))?.isFile()) {
  fail(`exports["./skills"] points at "${pkg.exports['./skills']}", which does not exist`)
} else {
  ok(`skill provider entry: ${pkg.exports['./skills']}`)
}

for (const required of ['LICENSE', 'NOTICE.md', 'README.md', 'README.en.md', 'CHANGELOG.md', 'docs/guide.zh.md', 'docs/guide.en.md', 'docs/architecture.md', 'docs/plugin-vs-preset.md', 'examples/profile-override.patch.yml', 'preset/standard-parity.json']) {
  if (!(await stat(join(pkgRoot, required)).catch(() => null))?.isFile()) fail(`${required} is missing`)
}
if (!(pkg.files ?? []).includes('LICENSE') || !(pkg.files ?? []).includes('NOTICE.md')) {
  fail('package.json "files" omits LICENSE or NOTICE.md, so the published tarball would drop the upstream licence notice')
}

// ------------------------------------------------------------------ preset --

const patchText = await readFile(join(pkgRoot, patchRel), 'utf8')

/** Rows are indentation-scanned rather than YAML-parsed: one fewer moving part. */
function topLevelInsertedRowIds(text) {
  const ids = []
  for (const line of text.split('\n')) {
    const match = /^ {4}- id:\s*(\S+)\s*$/.exec(line)
    if (match !== null) ids.push(match[1])
  }
  return ids
}

const insertedIds = topLevelInsertedRowIds(patchText)
if (!insertedIds.includes(PRESET_ROW_ID)) {
  fail(`cordis.patch.yml does not insert the row id "${PRESET_ROW_ID}" (found: ${insertedIds.join(', ') || 'none'})`)
} else {
  ok(`bundle inserts: ${insertedIds.join(', ')}`)
}

if (!patchText.includes("name: '@deepseek-ai/dsh-agent-preset'")) {
  fail('cordis.patch.yml does not mount @deepseek-ai/dsh-agent-preset')
}
if (!new RegExp(`^ {8}id: ${PRESET_ID}$`, 'm').test(patchText)) {
  fail(`the preset declaration does not set config.id: ${PRESET_ID}`)
}
if (!/^ {8}name: \S/m.test(patchText)) {
  fail('the preset declaration sets no display name; the card would show the raw id')
}
if (!/^ {8}description:/m.test(patchText)) {
  fail('the preset declaration sets no description; the card would show 「暂无描述」')
}
if (!/^ {8}order: \d+$/m.test(patchText)) {
  fail('the preset declaration sets no order; roster position would be undefined')
}

// Every plugin specifier must be resolvable at load time.
const KNOWN_SPECIFIER = /^(@deepseek-ai\/[\w.-]+(\/[\w.-]+)?|cordis:[\w-]+|dsh-superpowers-preset(\/[\w.-]+)?)$/
const specifiers = [...patchText.matchAll(/^\s+name:\s*'([^']+)'\s*$/gm)].map(match => match[1])
if (specifiers.length === 0) fail('cordis.patch.yml names no plugins')
for (const specifier of specifiers) {
  if (specifier === '@deepseek-ai/dsh-agent-preset') continue
  if (!KNOWN_SPECIFIER.test(specifier)) {
    fail(`plugin specifier "${specifier}" is neither a harness package, a cordis primitive, nor a subpath of this package`)
  }
}
if (!specifiers.includes('dsh-superpowers-preset/skills')) {
  fail('the preset does not mount dsh-superpowers-preset/skills, so the mode would have no Superpowers skills')
}
// The entire point of this package is that the provider is mounted *inside the
// preset*, never as a host row. A top-level row naming this package would
// register the catalog into the global skill layer, putting it in every
// session's system prompt — the exact behaviour this package exists to avoid.
const hostLevelSpecifiers = [...patchText.matchAll(/^ {6}name:\s*'([^']+)'\s*$/gm)].map(match => match[1])
const leaked = hostLevelSpecifiers.filter(specifier => specifier.startsWith('dsh-superpowers-preset'))
if (leaked.length > 0) {
  fail(
    `cordis.patch.yml mounts ${leaked.join(', ')} as a host-level row. ` +
    'The skill provider must stay inside the preset\'s plugin list, or its skills leak into every session.',
  )
}
ok(`plugin rows: ${specifiers.length} specifiers, all resolvable; provider is preset-scoped (host rows: ${hostLevelSpecifiers.join(', ')})`)

// This preset is meant to be Standard plus Superpowers. DSH disables several
// working rows at the host layer and lets each preset mount its own copy —
// `skill-filesystem` (local skill discovery) is the one that bites, because a
// preset that forgets it silently loses every project and user skill. The
// snapshot records what the shipped preset carries so that loss fails the build.
const parity = await readJson(join(pkgRoot, 'preset', 'standard-parity.json'))
// The commit pins the DSH release the snapshot was taken from; verify keeps the
// two in step so a hand-edited or stale parity file cannot silently claim a
// different release than the one the docs and the mirror name.
const verifiedDsh = pkg.dsh?.verifiedDsh
if (typeof verifiedDsh !== 'string' || verifiedDsh === '') {
  fail('package.json is missing dsh.verifiedDsh — the DSH release this preset is verified against')
} else if (verifiedDsh !== parity.dshVersion) {
  fail(
    `package.json pins dsh.verifiedDsh ${verifiedDsh}, but the parity snapshot records ` +
    `${parity.dshVersion}; re-run scripts/sync-preset-from-dsh.mjs and review`,
  )
} else {
  ok(`verified DSH release: ${verifiedDsh}`)
}
if (!Array.isArray(parity.rows) || parity.rows.length === 0) {
  fail('preset/standard-parity.json carries no rows; refresh it with scripts/sync-preset-from-dsh.mjs')
} else if (!Array.isArray(parity.blocks) || parity.blocks.length === 0) {
  fail('preset/standard-parity.json carries no block digests; refresh it with scripts/sync-preset-from-dsh.mjs')
} else {
  // Presence by name and module, flattened across groups: a missing capability
  // has to fail even when its row moved deeper into the tree.
  const shippedKeys = new Set(collectRows(patchText).map(row => `${row.id}|${row.name}`))
  const missing = parity.rows.filter(row => !shippedKeys.has(`${row.id}|${row.name}`))
  if (missing.length > 0) {
    fail(
      `the preset no longer mounts ${missing.length} row(s) the shipped standard preset carries: ` +
      `${missing.map(row => row.id).join(', ')}.\n` +
      '    A missing row is a missing capability — re-mirror with scripts/sync-preset-from-dsh.mjs, ' +
      'or record the deliberate removal in the README compatibility table.',
    )
  }
  // Presence is not enough: the point of the mirror is that each row says the
  // same thing here as in the shipped preset. Hashing the whole top-level block
  // covers every config value, isolate map, disabled expression, and nested row.
  //
  // The digest map only holds rows that are still TOP-LEVEL. Compare both
  // directions explicitly: a mirrored row moved into a new group would otherwise
  // be skipped by the digest filter (its id is no longer a top-level key) while
  // the flattened presence check above still found it, and a hand-added extra
  // top-level row would never be compared at all. This is what makes "Standard
  // plus this package's two rows" a structural invariant rather than a claim.
  const topLevel = new Map(topLevelBlocks(patchText).map(block => [block.id, blockDigest(block.text)]))
  const expected = new Map(parity.blocks.map(block => [block.id, block.sha256]))
  const ownTopLevelRows = new Set(['persona', 'superpowers-skills'])
  const demoted = parity.blocks.map(block => block.id).filter(id => !topLevel.has(id))
  if (demoted.length > 0) {
    fail(
      `the preset no longer carries ${demoted.join(', ')} as top-level row(s) of its plugin list.\n` +
      '    A mirrored row moved into a group is not the shipped composition — put local changes in a ' +
      'profile patch, or re-mirror with scripts/sync-preset-from-dsh.mjs.',
    )
  }
  const extra = [...topLevel.keys()].filter(id => !expected.has(id) && !ownTopLevelRows.has(id))
  if (extra.length > 0) {
    fail(
      `cordis.patch.yml carries top-level plugin row(s) the shipped standard preset does not: ` +
      `${extra.join(', ')}.\n` +
      '    A row this package adds is lost on the next mirror unless the sync script keeps it; ' +
      'declare it deliberately or drop it.',
    )
  }
  const altered = parity.blocks.filter(block => topLevel.get(block.id) !== block.sha256).map(block => block.id)
  if (altered.length > 0) {
    fail(
      `the preset's copy of ${altered.length} mirrored row(s) no longer matches the shipped standard ` +
      `preset: ${altered.join(', ')}.\n` +
      '    Hand-editing a mirrored row breaks the "Standard plus Superpowers" guarantee — put local ' +
      'changes in a profile patch instead, or re-mirror with scripts/sync-preset-from-dsh.mjs.',
    )
  }
  ok(
    `standard parity: ${parity.rows.length} rows present and ${parity.blocks.length} top-level blocks ` +
    `byte-identical, in place (snapshot from DSH ${parity.dshVersion}), plus this package's own two rows`,
  )
}

// The market-tools row is the one capability the 0.2.1-rc.2 Standard list gained
// over the previous mirror. Check it by name as well as through the snapshot: a
// missing row is a missing capability, and the snapshot that would otherwise
// catch it is produced by the same script that produces the mirror. Top-level,
// because moving a row into a group is not the shipped composition.
const pluginMarket = topLevelBlocks(patchText).find(block => block.id === 'tool-plugin-market')
if (pluginMarket === undefined) {
  fail("cordis.patch.yml no longer carries the shipped standard preset's `tool-plugin-market` as a top-level row")
} else {
  const marketName = /^ *name: ['"]?([^'"\n]+)['"]?\s*$/m.exec(pluginMarket.text)?.[1]
  if (marketName !== '@deepseek-ai/dsh-plugin-market/tools') {
    fail(`row "tool-plugin-market" mounts "${marketName}", expected "@deepseek-ai/dsh-plugin-market/tools"`)
  } else {
    ok('plugin market: the tool-plugin-market row Standard carries is present as a top-level row')
  }
}

// --------------------------------------------------------------- bootstrap --

const bootstrapBody = await readSkillBody(pkgRoot)
const expectedPrefix = renderPrefix(bootstrapBody)
assertNoTemplateGroups(expectedPrefix)

const shippedPrefix = readPrefixFromPatch(patchText)
if (shippedPrefix !== expectedPrefix) {
  fail(
    'the persona prefix in cordis.patch.yml no longer matches skills/using-superpowers/SKILL.md.\n' +
    `    shipped ${shippedPrefix.length} chars, expected ${expectedPrefix.length}.\n` +
    '    Run `node scripts/sync-bootstrap.mjs` and commit the result.',
  )
} else {
  ok(`bootstrap: ${expectedPrefix.length} chars = identity (${IDENTITY.length}) + using-superpowers body (${bootstrapBody.length})`)
}
// Until DSH 0.2.1 the shipped `standard` preset ended with `suffix: Your working
// directory is {{cwd}}.`. That release dropped the suffix and the `cwd` prompt
// variable it referenced: only `provider` and `model` are registered, so any
// suffix naming `{{cwd}}` fails prompt assembly for new *and* resumed sessions in
// the mode. Standard carries no suffix; neither may this preset.
if (/^\s+suffix:/m.test(patchText)) {
  fail(
    'the persona row must not set a suffix. The shipped standard preset has none, and a suffix\n' +
    '    referencing {{cwd}} cannot resolve — the loop registers only {{provider}} and {{model}}.',
  )
}
if (patchText.includes('{{cwd}}')) {
  fail(
    'cordis.patch.yml still references {{cwd}}, which DSH 0.2.1 no longer registers as a prompt\n' +
    '    variable; prompt assembly would fail before any model request. Use the working-directory\n' +
    '    runtime context instead of a persona suffix.',
  )
}
if (bootstrapBody.length < 1500) {
  fail(`the bootstrap body is only ${bootstrapBody.length} chars — the skill file looks truncated`)
}

// The shipped override example is a *wholesale* replacement of the preset
// config, so it drifts silently whenever the preset changes. Keep it honest:
// it must carry the same bootstrap, no row the preset does not have, and every
// row it does carry has to say exactly what the preset says.
const examplePath = join(pkgRoot, 'examples', 'profile-override.patch.yml')
const exampleText = await readFile(examplePath, 'utf8')
if (!exampleText.includes(`- id: ${PRESET_ROW_ID}`)) {
  fail(`examples/profile-override.patch.yml does not target the row id ${PRESET_ROW_ID}`)
}
if (readPrefixFromPatch(exampleText) !== expectedPrefix) {
  fail('examples/profile-override.patch.yml carries a stale persona prefix; regenerate it from cordis.patch.yml')
}
if (/^\s+suffix:/m.test(exampleText) || exampleText.includes('{{cwd}}')) {
  fail(
    'examples/profile-override.patch.yml still shows a persona suffix. Standard carries none since\n' +
    '    DSH 0.2.1, and {{cwd}} no longer resolves; drop the suffix from the copy-pasteable config.',
  )
}
// `collectRows` flattens whole subtrees, so a stale row *inside* a group counts
// too. Scanning for the ten-space indent (as this check used to) saw only
// top-level rows and therefore missed exactly the rows an upgrade drops: the
// alpha.1 `tool-subagent-codex`, `tool-subagent-claude-code`, and `tool-ralph`
// rows all lived inside the `delegation` group, indented past the pattern.
const exampleRowIds = collectRows(exampleText).map(row => row.id)
const shippedRowIds = new Set(collectRows(patchText).map(row => row.id))
for (const id of exampleRowIds) {
  if (!shippedRowIds.has(id)) fail(`examples/profile-override.patch.yml mounts row "${id}", which the shipped preset does not have`)
}
// The example deliberately drops `present`, whose row this override replaces;
// every other shipped top-level row has to be there.
const DROPPED_FROM_EXAMPLE = new Set(['present'])
const exampleBlocks = new Map(topLevelBlocks(exampleText).map(block => [block.id, blockDigest(block.text)]))
for (const block of topLevelBlocks(patchText)) {
  if (!DROPPED_FROM_EXAMPLE.has(block.id) && !exampleBlocks.has(block.id)) {
    fail(`examples/profile-override.patch.yml is missing the shipped row "${block.id}"`)
  }
}
// Presence is not enough. The example promises to keep every other row "byte
// for byte", so comparing block digests is what catches an obsolete config key
// (`backgroundMode`) or a reworded section the mirror updated and the example
// did not — both of which the alpha.1 example shipped.
const alteredExampleBlocks = topLevelBlocks(patchText)
  .filter(block => exampleBlocks.has(block.id) && exampleBlocks.get(block.id) !== blockDigest(block.text))
  .map(block => block.id)
if (alteredExampleBlocks.length > 0) {
  fail(
    `examples/profile-override.patch.yml carries ${alteredExampleBlocks.length} row block(s) that no longer match ` +
    `the shipped preset: ${alteredExampleBlocks.join(', ')}.\n` +
    '    Re-copy the plugin list out of cordis.patch.yml after every mirror, or the override pins an old composition.',
  )
}
ok(
  `override example: ${exampleRowIds.length} rows all shipped, ${exampleBlocks.size} blocks byte-identical, ` +
  `bootstrap in step (drops: ${[...DROPPED_FROM_EXAMPLE].join(', ')})`,
)

// ------------------------------------------- removed subagent config keys --

// The DSH 0.2.1 line removed `persona` and `toolFilter` from
// `@deepseek-ai/dsh-tool-subagent` (the removal first shipped in
// 0.2.1-alpha.3): the plugin's `apply()` throws when either key is present,
// which marks the whole preset broken ("agent preset superpowers: tool-subagent
// … toolFilter is no longer supported") and blocks every session in the mode.
// The shipped `standard` preset dropped both — the child schedule-tool
// restriction moved into the tool layer — so a re-mirror deletes them. Fail
// loudly if a hand edit, or a future DSH release this port has not adapted to,
// puts either key back.
//
// Checked on the row that mounts the plugin, from the parsed entry list rather
// than by scanning the file: a quoted, spaced, or inline spelling still fails,
// and a legitimate `persona:` config key on another plugin row does not.
const SUBAGENT_SPECIFIER = '@deepseek-ai/dsh-tool-subagent'
const REMOVED_SUBAGENT_CONFIG_KEYS = ['persona', 'toolFilter']
for (const [label, text] of [['cordis.patch.yml', patchText], ['examples/profile-override.patch.yml', exampleText]]) {
  for (const row of rowBlocks(text)) {
    if (row.name !== SUBAGENT_SPECIFIER) continue
    const removed = directConfigKeys(row).filter(key => REMOVED_SUBAGENT_CONFIG_KEYS.includes(key))
    if (removed.length > 0) {
      fail(
        `${label}: row "${row.id}" (${SUBAGENT_SPECIFIER}) sets ${removed.join(', ')}.\n` +
        '    DSH 0.2.1 removed those config keys (first shipped in 0.2.1-alpha.3) and the plugin\n' +
        '    throws at mount when either is present, which breaks the whole preset. Configure\n' +
        '    persona and tool plugins in the preset composition instead.',
      )
    }
  }
}
ok('delegation rows: no subagent config keys removed by DSH 0.2.1')

// ------------------------------------------------------------------ skills --

const skillsRoot = join(pkgRoot, 'skills')
const skillDirs = (await readdir(skillsRoot, { withFileTypes: true }))
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
  .sort()

const { apply: applySkills } = await import(new URL('../lib/skills.js', import.meta.url).href)
let provider
applySkills({
  skills: {
    registerProvider(factory) {
      provider = factory({ signal: new AbortController().signal, invalidate() {} })
    },
  },
})
if (provider === undefined) fail('lib/skills.js did not register a provider on ctx.skills')

const listed = await provider.list({})
const names = listed.map(candidate => candidate.name)
if (listed.length !== skillDirs.length) {
  fail(`provider listed ${listed.length} skills for ${skillDirs.length} directories on disk`)
}
const duplicates = names.filter((name, index) => names.indexOf(name) !== index)
if (duplicates.length > 0) fail(`duplicate skill names in the catalog: ${[...new Set(duplicates)].join(', ')}`)
for (const [index, candidate] of listed.entries()) {
  if (candidate.name !== skillDirs[index]) {
    fail(`skills/${skillDirs[index]}/SKILL.md declares name "${candidate.name}" — the directory and the frontmatter must agree`)
  }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(candidate.name)) {
    fail(`skill name "${candidate.name}" is not kebab-case; the registry would reject it`)
  }
  if (typeof candidate.description !== 'string' || candidate.description.length < 20) {
    fail(`skill "${candidate.name}" has no usable description; it would be unfindable in the catalog`)
  }
  if (candidate.source !== 'custom') fail(`skill "${candidate.name}" advertises source "${candidate.source}"`)
}

for (const candidate of listed) {
  const loaded = await provider.get(candidate, {})
  if (loaded === undefined) {
    fail(`skill "${candidate.name}" is listed but cannot be read back`)
    continue
  }
  if (typeof loaded.content !== 'string' || loaded.content.length < 200) {
    fail(`skill "${candidate.name}" loaded only ${loaded.content?.length ?? 0} chars of body`)
  }
  if (loaded.resourceBase?.kind !== 'directory' || loaded.resourceBase.path !== candidate.locator.directory) {
    fail(`skill "${candidate.name}" reports the wrong resource base; relative references would not resolve`)
  }
}
ok(`skills: ${listed.length} bundles list, load, and resolve`)

// A rewritten skill that still links to a removed file is a broken instruction.
const REMOVED = ['CLAUDE_MD_TESTING.md', 'claude-code-tools.md', 'codex-tools.md', 'gemini-tools.md', 'pi-tools.md', 'muse-tools.md', 'hermes-tools.md', 'antigravity-tools.md']

/**
 * Upstream documents that link to *hypothetical* files on purpose, as worked
 * examples of progressive disclosure. They are not shipped and never were, so
 * the dangling-link check must not treat them as regressions.
 */
const ILLUSTRATIVE_LINKS = new Set(['writing-skills/anthropic-best-practices.md'])
const { readdir: readdirRecursive } = await import('node:fs/promises')

/** Walk every file under a root, returning repo-relative POSIX paths. */
async function walkFiles(root, current = root, out = []) {
  for (const entry of await readdirRecursive(current, { withFileTypes: true })) {
    const full = join(current, entry.name)
    if (entry.isDirectory()) await walkFiles(root, full, out)
    else out.push(full)
  }
  return out
}

const skillFiles = await walkFiles(skillsRoot)
for (const path of skillFiles) {
  if (!/\.(md|markdown)$/.test(path)) continue
  const text = await readFile(path, 'utf8')
  const rel = path.slice(skillsRoot.length + 1).split('\\').join('/')
  for (const removed of REMOVED) {
    if (text.includes(removed)) fail(`${rel} still references the removed upstream file ${removed}`)
  }
  for (const match of text.matchAll(/\]\((?!https?:|#)([^)\s]+)\)/g)) {
    if (ILLUSTRATIVE_LINKS.has(rel)) break
    const target = match[1]
    const resolved = resolve(dirname(path), target)
    if (!(await stat(resolved).catch(() => null))) fail(`${rel} links to "${target}", which does not exist`)
  }
}
ok('skills: no dangling relative links, no references to removed harness files')

// `port/overrides/` is laid over the synced upstream tree by
// `scripts/sync-from-upstream.mjs`, so each override has a byte-identical
// shipped copy under `skills/`. Nothing in CI runs that sync script, so a hand
// edit to only one copy — the easy mistake when fixing a reference file — would
// otherwise ship instructions nobody reviewed against the other copy.
const overridesRoot = join(pkgRoot, 'port', 'overrides')
const overrideFiles = await walkFiles(overridesRoot)
for (const path of overrideFiles) {
  const rel = path.slice(overridesRoot.length + 1).split('\\').join('/')
  const shippedFile = join(skillsRoot, ...rel.split('/'))
  const shipped = await readFile(shippedFile).catch(() => undefined)
  if (shipped === undefined) {
    fail(`port/overrides/${rel} has no shipped copy at skills/${rel}`)
  } else if (!shipped.equals(await readFile(path))) {
    fail(`skills/${rel} differs from port/overrides/${rel}; copy the override over the shipped file`)
  }
}
ok(`overrides: ${overrideFiles.length} file(s) byte-identical to their shipped copies`)

// --------------------------------------------------------------- reporting --

for (const note of notes) console.log(`  ok  ${note}`)
if (problems.length > 0) {
  console.error('')
  for (const problem of problems) console.error(`  FAIL  ${problem}`)
  console.error(`\nverify: ${problems.length} problem(s)\n`)
  process.exit(1)
}
console.log(`\nverify: OK — ${notes.length} checks passed\n`)
