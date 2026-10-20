#!/usr/bin/env node
/**
 * Rebuild this preset's plugin list from the shipped `standard` preset of a DSH
 * checkout, keeping only the Superpowers additions.
 *
 * The preset is meant to be **Standard plus Superpowers**, not a hand-rolled
 * composition that drifts away from it. DSH disables several working rows at
 * the host layer and lets each agent preset mount its own copy — notably
 * `skill-filesystem`, which is what discovers project and user skills. A preset
 * that forgets to mount it silently loses every local skill, and the loss is
 * invisible until someone notices their own skills are gone. That is exactly
 * the failure this script exists to prevent.
 *
 *   node scripts/sync-preset-from-dsh.mjs <path-to-dsh-checkout>
 *   node scripts/sync-preset-from-dsh.mjs <path-to-dsh-checkout> --check
 *   node scripts/sync-preset-from-dsh.mjs <path-to-dsh-checkout> --accept-dsh-version
 *
 * It refuses a checkout older than the 0.2.1 line that dropped the removed
 * `persona`/`toolFilter` subagent config, and it refuses a checkout whose DSH
 * version differs from the committed snapshot unless `--accept-dsh-version`
 * says the upgrade is deliberate. That makes "mirror a different release" a
 * decision instead of a side effect of passing the wrong path.
 *
 * It rewrites:
 *
 *   - the `plugins` list in `cordis.patch.yml`: our persona block and our own
 *     rows stay verbatim, everything after them is the shipped `standard` list
 *     copied byte for byte, and
 *   - `preset/standard-parity.json`: a committed snapshot of every row the
 *     shipped preset carries, which `scripts/verify.mjs` checks us against so a
 *     missing row fails the build even without a DSH checkout at hand.
 *
 * `--check` reports drift without writing, for CI and for upgrade review.
 *
 * @module scripts/sync-preset-from-dsh
 */

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { blockDigest, collectRows, directConfigKeys, rowBlocks, topLevelBlocks } from './lib/rows.mjs'
import { IDENTITY } from './lib/preset.mjs'

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const patchPath = join(pkgRoot, 'cordis.patch.yml')
const parityPath = join(pkgRoot, 'preset', 'standard-parity.json')

/** Where the shipped preset lives inside a DSH source checkout. */
const STANDARD_PRESET = 'packages/bundle/web-app/presets/standard.patch.yml'

/** Rows that are ours, kept ahead of the mirrored block. */
const OWN_ROW_IDS = ['persona', 'superpowers-skills']

/** Abort with a readable reason. */
function fail(message) {
  console.error(`\n[sync-preset-from-dsh] FAIL: ${message}\n`)
  process.exit(1)
}

/**
 * Split a preset patch into its header, the `plugins:` line, and the plugin
 * entries themselves.
 * @param text - the patch file.
 * @param file - path used in diagnostics.
 * @returns the three parts, or aborts when the file is not shaped as expected.
 */
function splitPlugins(text, file) {
  const lines = text.split('\n')
  const pluginsAt = lines.findIndex(line => /^ {8}plugins:\s*$/.test(line))
  if (pluginsAt < 0) fail(`${file}: no `+'`plugins:`'+` line at the preset config indent`)
  const entryAt = lines.findIndex((line, index) => index > pluginsAt && /^ {10}- id: /.test(line))
  if (entryAt < 0) fail(`${file}: no plugin entries under `+'`plugins:`')
  return {
    header: lines.slice(0, pluginsAt).join('\n'),
    entries: lines.slice(entryAt).join('\n'),
  }
}

/**
 * Cut one `- id: <id>` block out of an entry list.
 * @param entries - the entry list text.
 * @param id - row id to remove.
 * @returns the block and the remaining text.
 */
function takeBlock(entries, id) {
  const lines = entries.split('\n')
  const start = lines.findIndex(line => line === `          - id: ${id}`)
  if (start < 0) fail(`no `+'`- id: '+id+'`'+` row found in the entry list`)
  let end = start + 1
  while (end < lines.length && !/^ {10}- id: /.test(lines[end])) end++
  // Trailing blank and comment lines belong to whatever follows, not to this
  // row. Without this, each run would absorb the section comment below the last
  // own row and then re-add it, duplicating it on every sync.
  let cut = end
  while (cut > start + 1 && (lines[cut - 1].trim() === '' || lines[cut - 1].trimStart().startsWith('#'))) cut--
  return {
    block: lines.slice(start, cut).join('\n'),
    rest: [...lines.slice(0, start), ...lines.slice(cut)].join('\n'),
  }
}

const dshRoot = process.argv[2]
const check = process.argv.includes('--check')
const acceptDshVersion = process.argv.includes('--accept-dsh-version')
if (dshRoot === undefined) {
  console.error(
    'usage: node scripts/sync-preset-from-dsh.mjs <path-to-dsh-checkout> [--check] [--accept-dsh-version]',
  )
  process.exit(2)
}

const standardPath = join(resolve(dshRoot), STANDARD_PRESET)
const standardText = await readFile(standardPath, 'utf8').catch(() => undefined)
if (standardText === undefined) {
  fail(`no shipped standard preset at ${standardPath}\n  Pass the root of a DSH source checkout.`)
}

const standard = splitPlugins(standardText, standardPath)
// Standard's own additions are not ours to keep: we mirror everything except
// the persona, which this port extends with the Superpowers bootstrap.
const shippedPersona = takeBlock(standard.entries, 'persona').block
standard.rest = takeBlock(standard.entries, 'persona').rest

// The DSH 0.2.1 line removed `persona` and `toolFilter` from
// `@deepseek-ai/dsh-tool-subagent` (the removal first shipped in
// 0.2.1-alpha.3), and that plugin now throws at mount when either key is
// present — which marks the whole preset broken. Standard dropped both. Refuse
// an older checkout here instead of silently re-mirroring the keys that break
// the mode.
const SUBAGENT_SPECIFIER = '@deepseek-ai/dsh-tool-subagent'
const REMOVED_SUBAGENT_CONFIG_KEYS = ['persona', 'toolFilter']
for (const row of rowBlocks(standard.rest)) {
  if (row.name !== SUBAGENT_SPECIFIER) continue
  const removed = directConfigKeys(row).filter(key => REMOVED_SUBAGENT_CONFIG_KEYS.includes(key))
  if (removed.length > 0) {
    fail(
      `the checkout's standard preset still configures ${removed.join(', ')} on row "${row.id}".\n` +
      '  DSH 0.2.1 removed those keys (first shipped in 0.2.1-alpha.3) and the plugin throws at\n' +
      '  mount when they are present. This checkout predates the target; check out a newer DSH\n' +
      '  release instead of mirroring an older contract.',
    )
  }
}

// The target Standard list carries the market-tools row (`tool-plugin-market`,
// added in DSH 0.2.1-alpha.4). Without this guard a checkout that predates it
// would write a mirror with a silently missing capability; the version opt-in
// alone cannot catch a first run from a clean older checkout.
const marketRow = rowBlocks(standard.rest).find(row => row.id === 'tool-plugin-market')
if (marketRow === undefined) {
  fail(
    "the checkout's standard preset carries no `tool-plugin-market` row.\n" +
    '  It was added in DSH 0.2.1-alpha.4. Check out the target release instead of mirroring an\n' +
    '  older capability list.',
  )
}
if (marketRow.name !== '@deepseek-ai/dsh-plugin-market/tools') {
  fail(
    `the checkout's standard preset mounts "${marketRow.name}" as tool-plugin-market.\n` +
    '  Expected @deepseek-ai/dsh-plugin-market/tools; update the mirror check if DSH renamed it.',
  )
}

// Our persona must be Standard's persona plus the bootstrap, so the identity
// line has to match the shipped one exactly, and Standard's suffix policy (none)
// has to be ours. If DSH rewords the identity or adds a suffix back, this port
// has to decide whether to follow before the mirror silently ships an older
// identity or an unresolvable variable.
const shippedPrefix = /^\s+prefix:[ \t]*(.+?)[ \t]*$/m.exec(shippedPersona)?.[1]
const shippedSuffix = /^\s+suffix:[ \t]*(.+?)[ \t]*$/m.exec(shippedPersona)?.[1]
if (shippedPrefix === undefined || shippedPrefix === '|' || shippedPrefix === '>-' || shippedPrefix === '|-') {
  fail(
    'the shipped standard preset no longer carries a single-line persona `prefix`.\n' +
    `  Found: ${JSON.stringify(shippedPrefix)}\n` +
    '  Update IDENTITY in scripts/lib/preset.mjs to match, then re-run.',
  )
}
if (shippedPrefix !== IDENTITY) {
  fail(
    'the shipped standard preset changed its persona identity line.\n' +
    `  shipped: ${JSON.stringify(shippedPrefix)}\n` +
    `  ours   : ${JSON.stringify(IDENTITY)}\n` +
    '  Update IDENTITY in scripts/lib/preset.mjs so this preset keeps Standard\'s identity, then re-run.',
  )
}
if (shippedSuffix !== undefined) {
  fail(
    'the shipped standard preset carries a persona suffix again.\n' +
    `  shipped: ${JSON.stringify(shippedSuffix)}\n` +
    '  Decide whether this port follows, and confirm every {{variable}} it uses is registered by the loop\n' +
    '  ({{cwd}} was unregistered in DSH 0.2.1 and fails prompt assembly), then update this guard.',
  )
}

const ours = splitPlugins(await readFile(patchPath, 'utf8'), patchPath)
let ownBlocks = ''
let rest = ours.entries
for (const id of OWN_ROW_IDS) {
  const taken = takeBlock(rest, id)
  rest = taken.rest
  ownBlocks += taken.block + '\n'
}
// Everything still ahead of the mirrored block must be a row Standard also
// carries — those are replaced wholesale by Standard's own copy below. A row
// only this package has would be dropped, so refuse instead of losing it.
const standardIds = new Set(collectRows(standard.rest).map(row => row.id))
const orphans = collectRows(rest).filter(row => !standardIds.has(row.id)).map(row => row.id)
if (orphans.length > 0) {
  fail(
    `cordis.patch.yml carries row(s) the shipped standard preset does not: ${orphans.join(', ')}.\n` +
    `  Add them to OWN_ROW_IDS so they survive a mirror, or remove them.`,
  )
}

const additions = [
  '          # ---- Superpowers additions ---------------------------------------------',
  '          # The identity line matches the shipped `standard` preset; everything after',
  '          # it is the bootstrap from skills/using-superpowers/SKILL.md.',
  '          # `scripts/sync-bootstrap.mjs` regenerates this block and `scripts/verify.mjs`',
  '          # fails if it drifts from the skill file.',
  ownBlocks.split('\n').slice(0, -1).join('\n'),
].join('\n')

const mirrored = [
  '',
  '          # ---- everything below mirrors the shipped `standard` preset --------------',
  '          # Regenerate with: node scripts/sync-preset-from-dsh.mjs <dsh-root>',
  '          # `scripts/verify.mjs` fails if any row Standard carries goes missing here,',
  '          # which is how a dropped local-skill provider would be caught.',
  standard.rest.replace(/\n+$/, ''),
].join('\n')

// The header comment and the preset metadata above `plugins:` are hand-written
// and preserved verbatim; this script only owns the plugin list.
const header = ours.header.replace(/\n+$/, '')

const nextText = `${header}\n        plugins:\n${additions}\n${mirrored}\n`

const standardRows = collectRows(standard.rest)
const standardBlocks = topLevelBlocks(standard.rest)

/** A DSH source checkout reports a semver root version; an installed package dir does not. */
const DSH_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

/** The DSH release the mirror was taken from. */
const dshVersion = JSON.parse(await readFile(join(resolve(dshRoot), 'package.json'), 'utf8').catch(() => '{}')).version
if (typeof dshVersion !== 'string' || !DSH_VERSION_PATTERN.test(dshVersion)) {
  fail(
    `cannot read a DSH version from ${join(resolve(dshRoot), 'package.json')}.\n` +
    '  Pass the root of a DSH source checkout: the script reads the checkout version and\n' +
    '  packages/bundle/web-app/presets/standard.patch.yml. An installed package directory is\n' +
    '  not a checkout.',
  )
}

const parity = {
  $comment:
    'Snapshot of the shipped `standard` preset, taken from a DSH source checkout. `rows` names every ' +
    'row it carries so a missing one can be reported by name; `blocks` records a sha256 per top-level ' +
    'row block, so scripts/verify.mjs also catches a mirrored row whose config, isolate map, disabled ' +
    'expression, or nested rows were edited by hand. A missing or altered row is a missing or altered ' +
    'capability. Refresh with: node scripts/sync-preset-from-dsh.mjs <dsh-root>',
  source: STANDARD_PRESET,
  dshVersion,
  rows: standardRows.map(row => ({ id: row.id, name: row.name, disabledInStandard: row.disabled })),
  blocks: standardBlocks.map(block => ({ id: block.id, sha256: blockDigest(block.text) })),
}

const currentText = await readFile(patchPath, 'utf8')
const currentParity = await readFile(parityPath, 'utf8').catch(() => undefined)
const nextParity = `${JSON.stringify(parity, null, 2)}\n`

// The checkout's version decides which DSH release the committed snapshot
// claims and which release the compatibility tables name. A different version is
// an upgrade decision, not a side effect of pointing the script at another
// checkout, so require the operator to opt in once and then update the docs.
let previousVersion
if (currentParity !== undefined) {
  try { previousVersion = JSON.parse(currentParity).dshVersion } catch { previousVersion = undefined }
}
if (!acceptDshVersion && previousVersion !== undefined && previousVersion !== parity.dshVersion) {
  fail(
    `the checkout reports DSH ${parity.dshVersion}, but the committed snapshot targets ${previousVersion}.\n` +
    '  Review the upgrade, then re-run with --accept-dsh-version, update the README compatibility\n' +
    '  tables and docs/version references, and finish with npm run verify.',
  )
}
if (acceptDshVersion && previousVersion !== undefined && previousVersion !== parity.dshVersion) {
  console.log(
    `[sync-preset-from-dsh] accepting DSH version change ${previousVersion} -> ${parity.dshVersion}; ` +
    'update dsh.verifiedDsh in package.json, the README compatibility tables, and docs/version references',
  )
}

if (check) {
  const drifted = currentText !== nextText || currentParity !== nextParity
  if (drifted) {
    fail(
      'this preset no longer matches the shipped standard preset in the given checkout.\n' +
      '  Re-run without --check, then review the diff and the README compatibility table.',
    )
  }
  console.log(`[sync-preset-from-dsh] OK — ${standardRows.length} mirrored rows, snapshot current`)
} else {
  const changed = currentText !== nextText
  await writeFile(patchPath, nextText, 'utf8')
  await writeFile(parityPath, nextParity, 'utf8')
  console.log(`[sync-preset-from-dsh] mirrored ${standardRows.length} rows from ${STANDARD_PRESET}`)
  console.log(`[sync-preset-from-dsh]   cordis.patch.yml ${changed ? 'rewritten' : 'already current'}`)
  console.log('[sync-preset-from-dsh] next: node scripts/verify.mjs')
}
