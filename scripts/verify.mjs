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
import { blockDigest, collectRows, topLevelBlocks } from './lib/rows.mjs'
import {
  IDENTITY,
  PERSONA_SUFFIX,
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

const patchRel = pkg.dsh?.bundle?.patch
if (typeof patchRel !== 'string') {
  fail('package.json is missing dsh.bundle.patch — the profile would install the package but mount nothing')
} else if (!(await stat(join(pkgRoot, patchRel)).catch(() => null))?.isFile()) {
  fail(`dsh.bundle.patch points at "${patchRel}", which does not exist`)
} else {
  ok(`bundle patch: ${patchRel}`)
}

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
const shippedKeys = new Set(collectRows(patchText).map(row => `${row.id}|${row.name}`))
if (!Array.isArray(parity.rows) || parity.rows.length === 0) {
  fail('preset/standard-parity.json carries no rows; refresh it with scripts/sync-preset-from-dsh.mjs')
} else {
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
  const ours = new Map(topLevelBlocks(patchText).map(block => [block.id, blockDigest(block.text)]))
  const altered = (parity.blocks ?? [])
    .filter(block => ours.has(block.id) && ours.get(block.id) !== block.sha256)
    .map(block => block.id)
  if (!Array.isArray(parity.blocks) || parity.blocks.length === 0) {
    fail('preset/standard-parity.json carries no block digests; refresh it with scripts/sync-preset-from-dsh.mjs')
  }
  if (altered.length > 0) {
    fail(
      `the preset's copy of ${altered.length} mirrored row(s) no longer matches the shipped standard ` +
      `preset: ${altered.join(', ')}.\n` +
      '    Hand-editing a mirrored row breaks the "Standard plus Superpowers" guarantee — put local ' +
      'changes in a profile patch instead, or re-mirror with scripts/sync-preset-from-dsh.mjs.',
    )
  }
  ok(
    `standard parity: ${parity.rows.length} rows present and ${parity.blocks.length} blocks byte-identical ` +
    `(snapshot from DSH ${parity.dshVersion}), plus this package's own provider`,
  )
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
if (!patchText.includes(`suffix: ${PERSONA_SUFFIX}`)) {
  fail(`the persona row must set suffix: ${PERSONA_SUFFIX}`)
}
if (bootstrapBody.length < 1500) {
  fail(`the bootstrap body is only ${bootstrapBody.length} chars — the skill file looks truncated`)
}

// The shipped override example is a *wholesale* replacement of the preset
// config, so it drifts silently whenever the preset changes. Keep it honest:
// it must carry the same bootstrap and only plugin rows the preset actually has.
const examplePath = join(pkgRoot, 'examples', 'profile-override.patch.yml')
const exampleText = await readFile(examplePath, 'utf8')
if (!exampleText.includes(`- id: ${PRESET_ROW_ID}`)) {
  fail(`examples/profile-override.patch.yml does not target the row id ${PRESET_ROW_ID}`)
}
if (readPrefixFromPatch(exampleText) !== expectedPrefix) {
  fail('examples/profile-override.patch.yml carries a stale persona prefix; regenerate it from cordis.patch.yml')
}
const exampleRowIds = [...exampleText.matchAll(/^ {10}- id: ([\w-]+)$/gm)].map(match => match[1])
const shippedRowIds = [...patchText.matchAll(/^ {10}- id: ([\w-]+)$/gm)].map(match => match[1])
for (const id of exampleRowIds) {
  if (!shippedRowIds.includes(id)) fail(`examples/profile-override.patch.yml mounts row "${id}", which the shipped preset does not have`)
}
ok(`override example: ${exampleRowIds.length}/${shippedRowIds.length} shipped rows, bootstrap in step`)

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

// --------------------------------------------------------------- reporting --

for (const note of notes) console.log(`  ok  ${note}`)
if (problems.length > 0) {
  console.error('')
  for (const problem of problems) console.error(`  FAIL  ${problem}`)
  console.error(`\nverify: ${problems.length} problem(s)\n`)
  process.exit(1)
}
console.log(`\nverify: OK — ${notes.length} checks passed\n`)
