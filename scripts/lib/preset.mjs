/**
 * Shared helpers for the one piece of this package that exists in two places:
 * the Superpowers bootstrap.
 *
 * The bootstrap IS the body of `skills/using-superpowers/SKILL.md`. It is
 * injected permanently as the preset's persona prefix, so the rules survive
 * context compaction and history trimming instead of being a one-shot message
 * that scrolls out of the window.
 *
 * Because it lives in two files, the two must not drift:
 *
 *   - the skill file is the source of truth (it is what `scripts/sync-from-upstream.mjs` rewrites), and
 *   - `cordis.patch.yml` carries the rendered copy inside the `persona` row.
 *
 * `sync-from-upstream` rewrites the YAML block after a successful sync, and
 * `verify.mjs` fails if the two ever disagree. Nothing here runs at load time:
 * the YAML is shipped literally, so the preset has no runtime file reads.
 *
 * @module scripts/lib/preset
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Preset identity saved by sessions and used as the roster key. */
export const PRESET_ID = 'superpowers'

/** Loader row id of the preset declaration inside the bundle patch. */
export const PRESET_ROW_ID = 'preset-superpowers'

/** The skill whose body becomes the bootstrap. */
export const BOOTSTRAP_SKILL = 'using-superpowers'

/**
 * Deployment-parity persona prefix. `dsh-persona` shadows the deployment-wide
 * persona, so a preset must restate the identity it wants rather than inherit
 * one; these two lines match the shipped `standard` preset exactly.
 */
export const IDENTITY = 'You are a coding agent powered by the {{model}} model.'

/** Deployment-parity persona suffix. */
export const PERSONA_SUFFIX = 'Your working directory is {{cwd}}.'

/** Template placeholder `dsh-persona` would try to resolve inside the prefix. */
const TEMPLATE_GROUP = /\{\{[^}]*\}\}/

/**
 * Read a packaged skill's body with its YAML frontmatter removed.
 * @param pkgRoot - repository/package root.
 * @param skillName - directory name under `skills/`.
 * @returns the trimmed body text.
 */
export async function readSkillBody(pkgRoot, skillName = BOOTSTRAP_SKILL) {
  const path = join(pkgRoot, 'skills', skillName, 'SKILL.md')
  const raw = await readFile(path, 'utf8')
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw
  const firstLineEnd = text.indexOf('\n')
  if (firstLineEnd < 0) throw new Error(`${path}: no frontmatter block`)
  if (text.slice(0, firstLineEnd).replace(/\r$/, '') !== '---') {
    throw new Error(`${path}: no frontmatter block`)
  }
  const closing = text.indexOf('\n---', firstLineEnd)
  if (closing < 0) throw new Error(`${path}: unterminated frontmatter block`)
  return text.slice(closing + 4).replace(/^\s+/, '').replace(/\s+$/, '')
}

/**
 * The exact persona prefix the preset must carry.
 * @param body - the bootstrap skill body.
 * @returns identity, a blank line, then the bootstrap.
 */
export function renderPrefix(body) {
  return `${IDENTITY}\n\n${body}`
}

/**
 * Fail loudly if the bootstrap text would be interpreted as a persona
 * template. `dsh-persona` resolves complete `{{…}}` groups against registered
 * prompt variables and rejects unknown names, which would break every session
 * in the mode rather than degrade gracefully.
 * @param prefix - rendered persona prefix.
 */
export function assertNoTemplateGroups(prefix) {
  // `{{model}}` and `{{cwd}}` are the two variables the shipped presets use;
  // any other group is a bug in the bootstrap text.
  const allowed = new Set(['{{model}}', '{{cwd}}'])
  const groups = prefix.match(/\{\{[^}]*\}\}/g) ?? []
  for (const group of groups) {
    if (!allowed.has(group)) {
      throw new Error(
        `the persona prefix contains the template group ${group}, which dsh-persona ` +
        'would try to resolve against registered prompt variables. Escape it or change the skill text.',
      )
    }
  }
  if (TEMPLATE_GROUP.test(body(prefix))) {
    throw new Error('the bootstrap body contains a {{…}} template group; see above')
  }
}

/** The prefix with the identity line removed, i.e. the injected bootstrap alone. */
function body(prefix) {
  return prefix.startsWith(IDENTITY) ? prefix.slice(IDENTITY.length) : prefix
}

/**
 * Locate the `prefix: |-` block scalar inside the preset's `persona` row.
 * @param patchText - `cordis.patch.yml` contents.
 * @returns the block's line span and indent, or `undefined` when it is absent.
 */
function findPrefixBlock(patchText) {
  const lines = patchText.split('\n')
  for (let index = 0; index < lines.length; index++) {
    const match = /^(\s*)prefix:\s*\|-\s*$/.exec(lines[index])
    if (match === null) continue
    const baseIndent = match[1].length
    let contentIndent = baseIndent + 2
    // Prefer the real indent of the first non-blank content line.
    for (let probe = index + 1; probe < lines.length; probe++) {
      if (lines[probe].trim() === '') continue
      const indent = lines[probe].length - lines[probe].trimStart().length
      if (indent > baseIndent) contentIndent = indent
      break
    }
    let end = index + 1
    while (end < lines.length) {
      const line = lines[end]
      if (line.trim() === '') { end++; continue }
      const indent = line.length - line.trimStart().length
      if (indent < contentIndent) break
      end++
    }
    // A literal block scalar ends at the last non-blank line; trailing blank
    // lines belong to whatever follows.
    let last = end
    while (last > index + 1 && lines[last - 1].trim() === '') last--
    return { start: index + 1, end: last, contentIndent }
  }
  return undefined
}

/**
 * Read the persona prefix out of a bundle patch.
 * @param patchText - `cordis.patch.yml` contents.
 * @returns the dedented prefix text.
 */
export function readPrefixFromPatch(patchText) {
  const block = findPrefixBlock(patchText)
  if (block === undefined) throw new Error('cordis.patch.yml: no `prefix: |-` block found')
  const lines = patchText.split('\n')
  return lines
    .slice(block.start, block.end)
    .map(line => (line.trim() === '' ? '' : line.slice(block.contentIndent)))
    .join('\n')
}

/**
 * Replace the persona prefix block in a bundle patch, preserving every other
 * byte of the file.
 * @param patchText - current `cordis.patch.yml` contents.
 * @param prefix - new prefix text.
 * @returns the updated file contents.
 */
export function writePrefixIntoPatch(patchText, prefix) {
  const block = findPrefixBlock(patchText)
  if (block === undefined) throw new Error('cordis.patch.yml: no `prefix: |-` block found')
  const lines = patchText.split('\n')
  const pad = ' '.repeat(block.contentIndent)
  const rendered = prefix.split('\n').map(line => (line === '' ? '' : pad + line))
  return [...lines.slice(0, block.start), ...rendered, ...lines.slice(block.end)].join('\n')
}
