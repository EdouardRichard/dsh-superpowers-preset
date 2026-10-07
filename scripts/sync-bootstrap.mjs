#!/usr/bin/env node
/**
 * Rewrite the `persona.prefix` block in `cordis.patch.yml` from the current
 * body of `skills/using-superpowers/SKILL.md`.
 *
 * The bootstrap lives in two places on purpose:
 *
 *   - the skill file is the source of truth, because that is what
 *     `scripts/sync-from-upstream.mjs` rewrites when upstream changes, and
 *   - the YAML carries the rendered copy, because the preset must ship the
 *     text literally — a preset that read a file at load time would depend on
 *     the package layout staying resolvable, which is a worse failure mode
 *     than a slightly longer YAML file.
 *
 * `scripts/sync-from-upstream.mjs` calls this after a successful sync, so a
 * version bump normally needs no manual step. Run it directly after editing
 * `skills/using-superpowers/SKILL.md` by hand.
 *
 *   node scripts/sync-bootstrap.mjs [--check]
 *
 * `--check` reports drift without writing, which is what `npm run verify` uses.
 *
 * @module scripts/sync-bootstrap
 */

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PRESET_ROW_ID,
  assertNoTemplateGroups,
  readPrefixFromPatch,
  readSkillBody,
  renderPrefix,
  writePrefixIntoPatch,
} from './lib/preset.mjs'

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const patchPath = join(pkgRoot, 'cordis.patch.yml')

/**
 * Compare (and optionally rewrite) the shipped bootstrap.
 * @param options - `write: true` updates the file; `write: false` only checks.
 * @returns whether the file already matched.
 */
export async function syncBootstrap({ write = true } = {}) {
  const body = await readSkillBody(pkgRoot)
  const expected = renderPrefix(body)
  assertNoTemplateGroups(expected)
  const patchText = await readFile(patchPath, 'utf8')
  const current = readPrefixFromPatch(patchText)
  if (current === expected) return true
  if (!write) return false
  // The write is byte-scoped to one block scalar; every comment and every
  // other row in the file survives untouched.
  await writeFile(patchPath, writePrefixIntoPatch(patchText, expected), 'utf8')
  return false
}

/** Run the CLI only when this file is the entry point (not when imported). */
const invokedDirectly = process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (invokedDirectly) {
  const check = process.argv.includes('--check')
  const matched = await syncBootstrap({ write: !check })
  if (check) {
    if (matched) {
      console.log(`[sync-bootstrap] OK — ${PRESET_ROW_ID} carries the current skills/using-superpowers/SKILL.md body`)
    } else {
      console.error(
        '[sync-bootstrap] DRIFT — the cordis.patch.yml persona prefix no longer matches\n' +
        '                 skills/using-superpowers/SKILL.md.\n' +
        '                 Run `npm run sync:bootstrap` and commit the result.',
      )
      process.exit(1)
    }
  } else {
    console.log(matched
      ? '[sync-bootstrap] already up to date'
      : '[sync-bootstrap] rewrote the persona prefix in cordis.patch.yml')
  }
}
