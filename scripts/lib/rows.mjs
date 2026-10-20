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

/**
 * Every row in an entry list, nested groups included, with its own indentation
 * and text. Unlike {@link collectRows}, the returned `text` carries the row's
 * config so callers can inspect the keys it sets, and `indent` locates field
 * lines without guessing an absolute column.
 * @param entries - the entry list text.
 * @returns `{ id, name, indent, text }` per row, in file order.
 */
export function rowBlocks(entries) {
  const rows = []
  const stack = []
  for (const line of entries.split('\n')) {
    const start = /^( *)- id: ([\w-]+)\s*$/.exec(line)
    if (start !== null) {
      const indent = start[1].length
      // A row at the same or shallower indent closes every row it is not nested in.
      while (stack.length > 0 && stack[stack.length - 1].indent >= indent) stack.pop()
      const row = { id: start[2], name: undefined, indent, lines: [line] }
      stack.push(row)
      rows.push(row)
      continue
    }
    for (const row of stack) row.lines.push(line)
    const name = /^( *)name: (.+?)\s*$/.exec(line)
    if (name !== null && stack.length > 0) {
      const top = stack[stack.length - 1]
      if (name[1].length === top.indent + 2 && top.name === undefined) {
        top.name = name[2].replace(/^'(.*)'$/, '$1')
      }
    }
  }
  return rows.map(row => ({ id: row.id, name: row.name, indent: row.indent, text: row.lines.join('\n') }))
}

/**
 * The keys a row sets directly under its `config:`, block style or inline.
 * Nested mappings are not descended into: a key there belongs to a config
 * object, not to the row's own config.
 * @param row - one {@link rowBlocks} entry.
 * @returns the direct config keys, in file order.
 */
export function directConfigKeys(row) {
  const lines = row.text.split('\n')
  const keys = []
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const match = /^( *)config:\s*(.*)$/.exec(line)
    if (match === null || match[1].length !== row.indent + 2) continue
    const inline = match[2].trim()
    if (inline !== '') {
      // Flow mapping: track brace depth so only the config object's own keys are
      // collected, skipping keys of a nested value object.
      let depth = 0
      let expectKey = false
      for (let cursor = 0; cursor < inline.length; cursor++) {
        const char = inline[cursor]
        if (char === '{') {
          depth++
          if (depth === 1) expectKey = true
          continue
        }
        if (char === '}') {
          depth--
          continue
        }
        if (char === ',' && depth === 1) {
          expectKey = true
          continue
        }
        if (!expectKey || depth !== 1) continue
        const key = /^[ \t]*["']?([A-Za-z][\w-]*)["']?\s*:/.exec(inline.slice(cursor))
        if (key !== null) {
          keys.push(key[1])
          cursor += key[0].length - 1
          expectKey = false
        } else if (char.trim() !== '') {
          expectKey = false
        }
      }
      return keys
    }
    const configIndent = match[1].length
    for (let probe = index + 1; probe < lines.length; probe++) {
      const candidate = lines[probe]
      if (candidate.trim() === '') continue
      const indent = candidate.length - candidate.trimStart().length
      if (indent <= configIndent) break
      if (indent !== configIndent + 2) continue
      const key = /^["']?([A-Za-z][\w-]*)["']?\s*:/.exec(candidate.trim())
      if (key !== null) keys.push(key[1])
    }
    return keys
  }
  return keys
}
