/**
 * Superpowers skill provider for the DeepSeek Harness.
 *
 * This is a Cordis plugin mounted as `superpowers-preset-dsh/skills` **inside
 * the `superpowers` agent preset's composition**, never at the host layer, and
 * that placement is the whole point:
 *
 * `ctx.skills.registerProvider()` files a registration into the layer of the
 * calling context's scope. A host row lands in the global layer, which every
 * session sees; a row mounted by an agent preset's standing composition lands
 * in that preset's layer alone, which only sessions created from that preset
 * read. Mounting here therefore makes the Superpowers catalog appear in
 * Superpowers sessions and nowhere else — no skill descriptions in the system
 * prompt of unrelated tasks, no wasted catalog tokens.
 *
 * The provider is a plain object with no runtime dependencies beyond Node's
 * built-ins, so it cannot drift with the profile's dependency tree. Skill
 * bodies live in `../skills/<name>/SKILL.md` beside this file; the root is
 * resolved from `import.meta.url`, which is an assembly fact of this package
 * and never user configuration.
 *
 * @module superpowers-preset-dsh/skills
 */

import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/** Provider name registered on `ctx.skills`; must be unique within the layer. */
export const name = 'superpowers-preset-dsh'

/** The skill registry is the one service this plugin consumes. */
export const inject = ['skills']

/** Absolute path to the packaged skill tree. */
const SKILLS_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'skills')

/**
 * Source bucket these skills advertise under. `custom` is the bucket DSH
 * reserves for skills a provider supplies outside the project/user roots.
 */
const SOURCE = 'custom'

/**
 * Rank inside this provider's own layer. Layers win by proximity before rank
 * is consulted, so this value only breaks ties if another provider is ever
 * mounted into the same preset scope; it deliberately matches the rank the
 * filesystem provider uses for custom roots.
 */
const RANK = 550

/** Frontmatter keys DSH skill discovery consumes. */
const SCALAR_KEYS = ['name', 'description', 'whenToUse']

/**
 * Split a `SKILL.md` into its YAML frontmatter map and its Markdown body.
 * Only the scalar keys the registry consumes are decoded; unknown keys are
 * ignored rather than guessed at, so richer upstream metadata cannot make a
 * skill load incorrectly.
 * @param text - raw file contents, with or without a UTF-8 BOM.
 * @returns the decoded frontmatter and body, or `null` when the file has no
 *   frontmatter block at all.
 */
export function parseFrontmatter(text) {
  const raw = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const firstLineEnd = raw.indexOf('\n')
  if (firstLineEnd < 0) return null
  if (raw.slice(0, firstLineEnd).replace(/\r$/, '') !== '---') return null
  const closing = findClosingFence(raw, firstLineEnd + 1)
  if (closing === undefined) return null
  const fields = {}
  for (const line of raw.slice(firstLineEnd + 1, closing.start).split('\n')) {
    const match = /^([A-Za-z][\w-]*):[ \t]*(.*)$/.exec(line.replace(/\r$/, ''))
    if (match === null || !SCALAR_KEYS.includes(match[1])) continue
    const value = decodeScalar(match[2])
    if (value !== undefined) fields[match[1]] = value
  }
  return { fields, body: raw.slice(closing.bodyStart) }
}

/**
 * Decode a single-line YAML scalar: plain, single-quoted, or double-quoted.
 * @param raw - the text after the `key:` separator.
 * @returns the decoded string, or `undefined` for an empty or block value.
 */
function decodeScalar(raw) {
  const value = raw.trim()
  if (value === '' || value === '|' || value === '>' || value === '|-' || value === '>-') return undefined
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value)
    } catch {
      return value.slice(1, -1)
    }
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'")
  }
  return value
}

/**
 * Locate the line that closes a frontmatter block.
 * @param raw - full file text.
 * @param start - index of the first character after the opening fence line.
 * @returns the closing fence's offsets, or `undefined` when it is missing.
 */
function findClosingFence(raw, start) {
  let lineStart = start
  while (lineStart <= raw.length) {
    const nextNewline = raw.indexOf('\n', lineStart)
    const lineEnd = nextNewline < 0 ? raw.length : nextNewline
    if (raw.slice(lineStart, lineEnd).replace(/\r$/, '') === '---') {
      return { start: lineStart, bodyStart: nextNewline < 0 ? raw.length : nextNewline + 1 }
    }
    if (nextNewline < 0) return undefined
    lineStart = nextNewline + 1
  }
  return undefined
}

/**
 * Read and decode one skill bundle.
 * @param skillFile - absolute path to the bundle's `SKILL.md`.
 * @returns the decoded skill, or `undefined` when the file is gone, has no
 *   frontmatter, or is missing `name`/`description`.
 */
async function readSkill(skillFile) {
  let text
  try {
    text = await readFile(skillFile, 'utf8')
  } catch {
    return undefined
  }
  const parsed = parseFrontmatter(text)
  if (parsed === null) return undefined
  const skillName = parsed.fields.name
  const description = parsed.fields.description
  if (typeof skillName !== 'string' || skillName === '') return undefined
  if (typeof description !== 'string' || description === '') return undefined
  return {
    name: skillName,
    description,
    ...(parsed.fields.whenToUse === undefined ? {} : { whenToUse: parsed.fields.whenToUse }),
    content: parsed.body.trim(),
  }
}

/**
 * Discover every packaged skill bundle: one directory per skill, each with a
 * `SKILL.md`.
 * @returns candidates ordered by directory name, so the catalog is stable.
 */
async function discover() {
  let entries
  try {
    entries = await readdir(SKILLS_ROOT, { withFileTypes: true })
  } catch {
    return []
  }
  const directories = entries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b))
  const candidates = []
  for (const directory of directories) {
    const skillFile = join(SKILLS_ROOT, directory, 'SKILL.md')
    const skill = await readSkill(skillFile)
    if (skill === undefined) continue
    candidates.push({
      ...skill,
      invocation: { modelInvocable: true, userInvocable: true },
      source: SOURCE,
      provider: name,
      rank: RANK,
      locator: { directory: join(SKILLS_ROOT, directory), path: skillFile },
      path: skillFile,
    })
  }
  return candidates
}

/**
 * Register the packaged Superpowers provider into this context's skill layer.
 * @param ctx - the preset-scoped Cordis context.
 */
export function apply(ctx) {
  ctx.skills.registerProvider(() => ({
    name,
    async list() {
      return await discover()
    },
    async get(candidate) {
      const skill = await readSkill(candidate.path)
      if (skill === undefined) return undefined
      return {
        ...skill,
        invocation: { modelInvocable: true, userInvocable: true },
        source: SOURCE,
        provider: name,
        resourceBase: { kind: 'directory', path: candidate.locator.directory },
        path: candidate.path,
      }
    },
  }))
}

export default { apply, name, inject }
