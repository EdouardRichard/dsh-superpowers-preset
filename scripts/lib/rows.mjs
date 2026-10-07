/**
 * Shared row parsing for a preset's `config.plugins` list.
 *
 * Both the mirror script and the verifier need the same answer to "what rows
 * does this preset carry, and what exactly does each one say". Keeping one
 * implementation matters more than avoiding the import: two slightly different
 * scanners would produce false parity failures, and a false failure is how a
 * real check gets deleted.
 *
 * The list is a plain YAML list nested inside a preset declaration, so it is
 * scanned by indentation rather than parsed as Loader rows.
 *
 * @module scripts/lib/rows
 */

import { createHash } from 'node:crypto'

/** Indentation of a top-level row inside a preset's `plugins:` list. */
const TOP_LEVEL_ID = /^ {10}- id: ([\w-]+)\s*$/

/**
 * Every row a preset carries, nested groups included, flattened.
 * @param entries - the entry list text.
 * @returns rows that resolved both an id and a module name, in file order.
 */
export function collectRows(entries) {
  const rows = []
  for (const line of entries.split('\n')) {
    const id = /^( +)- id: ([\w-]+)\s*$/.exec(line)
    if (id !== null) {
      rows.push({ indent: id[1].length, id: id[2], name: undefined, disabled: false })
      continue
    }
    const name = /^( +)name: (.+?)\s*$/.exec(line)
    if (name !== null && rows.length > 0) {
      const last = rows[rows.length - 1]
      if (last.name === undefined && name[1].length === last.indent + 2) {
        last.name = name[2].replace(/^'(.*)'$/, '$1')
      }
      continue
    }
    const disabled = /^( +)disabled: (.*)$/.exec(line)
    if (disabled !== null && rows.length > 0) {
      const last = rows[rows.length - 1]
      if (disabled[1].length === last.indent + 2) last.disabled = disabled[2].trim() !== 'false'
    }
  }
  return rows.filter(row => row.name !== undefined)
}

/**
 * Split an entry list into one text block per top-level row.
 *
 * A nested group's entire subtree belongs to its own block, so hashing a block
 * covers every config value, `isolate` map, `disabled` expression, and nested
 * row underneath it — which is what "mirrored byte for byte" has to mean.
 * @param entries - the entry list text.
 * @returns `{ id, text }` per top-level row, in file order.
 */
export function topLevelBlocks(entries) {
  const blocks = []
  let current = null
  for (const line of entries.split('\n')) {
    const start = TOP_LEVEL_ID.exec(line)
    if (start !== null) {
      if (current !== null) blocks.push(current)
      current = { id: start[1], lines: [line] }
      continue
    }
    if (current !== null) current.lines.push(line)
  }
  if (current !== null) blocks.push(current)
  return blocks
    .map(block => ({ id: block.id, text: block.lines.join('\n').replace(/\s+$/, '') }))
    .filter(block => block.text !== '')
}

/**
 * Stable digest of one row block.
 * @param text - the block's exact text.
 * @returns a sha256 hex digest, newline-normalized so a CRLF checkout agrees
 *   with an LF one.
 */
export function blockDigest(text) {
  return createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex')
}
