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
import { blockDigest, collectRows, topLevelBlocks } from './lib/rows.mjs'
import { IDENTITY, PERSONA_SUFFIX } from './lib/preset.mjs'

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
if (dshRoot === undefined) {
  console.error('usage: node scripts/sync-preset-from-dsh.mjs <path-to-dsh-checkout> [--check]')
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

// Our persona must be Standard's persona plus the bootstrap, so the identity
// line and working-directory suffix have to match the shipped ones exactly. If
// DSH rewords them, this port has to decide whether to follow before the mirror
// silently ships an older identity.
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
if (shippedSuffix !== PERSONA_SUFFIX) {
  fail(
    'the shipped standard preset changed its persona suffix.\n' +
    `  shipped: ${JSON.stringify(shippedSuffix)}\n` +
    `  ours   : ${JSON.stringify(PERSONA_SUFFIX)}\n` +
    '  Update PERSONA_SUFFIX in scripts/lib/preset.mjs, then re-run `npm run sync:bootstrap`.',
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

/** The DSH release the mirror was taken from, when the checkout reports one. */
const dshVersion = JSON.parse(await readFile(join(resolve(dshRoot), 'package.json'), 'utf8').catch(() => '{}')).version

const parity = {
  $comment:
    'Snapshot of the shipped `standard` preset, taken from a DSH source checkout. `rows` names every ' +
    'row it carries so a missing one can be reported by name; `blocks` records a sha256 per top-level ' +
    'row block, so scripts/verify.mjs also catches a mirrored row whose config, isolate map, disabled ' +
    'expression, or nested rows were edited by hand. A missing or altered row is a missing or altered ' +
    'capability. Refresh with: node scripts/sync-preset-from-dsh.mjs <dsh-root>',
  source: STANDARD_PRESET,
  dshVersion: dshVersion ?? 'unknown',
  rows: standardRows.map(row => ({ id: row.id, name: row.name, disabledInStandard: row.disabled })),
  blocks: standardBlocks.map(block => ({ id: block.id, sha256: blockDigest(block.text) })),
}

const currentText = await readFile(patchPath, 'utf8')
const currentParity = await readFile(parityPath, 'utf8').catch(() => undefined)
const nextParity = `${JSON.stringify(parity, null, 2)}\n`

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
