#!/usr/bin/env node
/**
 * Rebuild `skills/` from an `obra/superpowers` checkout, re-applying this
 * port's DeepSeek Harness adaptations.
 *
 * Upstream is the source of truth for what a skill *says*. This package is a
 * port, so it ships a small, explicit, **asserted** set of deltas instead of a
 * hand-edited fork:
 *
 *   1. `port/overrides/**` holds files that have no upstream counterpart (the
 *      DSH platform reference) and files this port owns outright. They are
 *      copied over the synced tree, so a re-sync cannot delete them.
 *   2. `TRANSFORMS` rewrites upstream text that names another harness, another
 *      harness's home directory, a bare script path, or a platform choice DSH
 *      does not have. Every transform must match exactly as many times as it
 *      declares, or the sync aborts.
 *   3. Every remaining `superpowers:` namespace prefix is stripped, because the
 *      DSH skill registry addresses skills by bare kebab-case name.
 *
 * Usage:
 *   node scripts/sync-from-upstream.mjs <path-to-superpowers-checkout>
 *
 * Fetch the pinned checkout with:
 *   curl -L https://codeload.github.com/obra/superpowers/tar.gz/refs/tags/v6.4.2 \
 *     | tar -xz -C .upstream --strip-components=1
 *
 * A missing anchor aborts the run on purpose: upstream changed text this port
 * depends on, and a human has to decide what the DSH wording becomes.
 *
 * @module scripts/sync-from-upstream
 */

import { readdir, readFile, writeFile, mkdir, cp, rm, rename, stat } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const destSkills = join(pkgRoot, 'skills')
/** The destination is only replaced after every assertion passed. */
const stagingSkills = join(pkgRoot, '.skills-sync-staging')
const overridesRoot = join(pkgRoot, 'port', 'overrides')

/** The exact upstream skill set this port ships. A change here is deliberate. */
const UPSTREAM_SKILLS = [
  'brainstorming',
  'diagnosing-superpowers',
  'dispatching-parallel-agents',
  'executing-plans',
  'finishing-a-development-branch',
  'receiving-code-review',
  'requesting-code-review',
  'subagent-driven-development',
  'systematic-debugging',
  'test-driven-development',
  'using-git-worktrees',
  'using-superpowers',
  'verification-before-completion',
  'writing-plans',
  'writing-skills',
]

/**
 * Per-harness reference files upstream ships. This port replaces the whole set
 * with one `dsh-tools.md`, so they are not distributed.
 */
const SKIP = [
  'using-superpowers/references/antigravity-tools.md',
  'using-superpowers/references/claude-code-tools.md',
  'using-superpowers/references/codex-tools.md',
  'using-superpowers/references/gemini-tools.md',
  'using-superpowers/references/hermes-tools.md',
  'using-superpowers/references/muse-tools.md',
  'using-superpowers/references/pi-tools.md',
]

const DSH_HOME = '$DSH_HOME'

/**
 * Upstream files whose *name* is harness-specific. Renaming keeps the shipped
 * tree readable; `TRANSFORMS` updates every reference to the old path.
 */
const RENAMES = new Map([
  ['writing-skills/examples/CLAUDE_MD_TESTING.md', 'writing-skills/examples/AGENTS_MD_TESTING.md'],
])

/**
 * Asserted rewrites, applied before the namespace strip. `file` is relative to
 * the synced tree; `find` must occur exactly once unless `expect` says
 * otherwise.
 */
const TRANSFORMS = [
  {
    name: 'using-superpowers: subagents follow the skills that fit their task',
    file: 'using-superpowers/SKILL.md',
    find: [
      '<SUBAGENT-STOP>',
      'If you were dispatched as a subagent to execute a specific task, ignore this skill.',
      '</SUBAGENT-STOP>',
      '',
    ].join('\n'),
    // Upstream tells subagents to ignore the whole skill. On DSH a subagent
    // inherits its parent's preset, so it does see the catalog — but telling it
    // to ignore everything would drop TDD from implementer subagents, which is
    // exactly what subagent-driven-development depends on. Narrow the carve-out
    // to the parts that would misfire in a subagent instead.
    replace: [
      '<IF-YOU-ARE-A-SUBAGENT>',
      'If you were dispatched as a subagent to execute a specific task: follow the',
      'skills that apply to the task you were given — an implementer uses',
      'test-driven-development, a reviewer uses the review template it was handed.',
      'Skip the conversation-level parts of this skill: do not re-open brainstorming,',
      'do not dispatch your own subagents, and do not ask the user clarifying',
      'questions unless your task explicitly says to. Report evidence, not conclusions.',
      '</IF-YOU-ARE-A-SUBAGENT>',
      '',
    ].join('\n'),
  },
  {
    name: 'using-superpowers: the DSH platform reference replaces the harness list',
    file: 'using-superpowers/SKILL.md',
    find: [
      '## Platform Adaptation',
      '',
      'If your harness appears here, read its reference file for special instructions:',
      '',
      '- Claude Code: `references/claude-code-tools.md`',
      '- Codex: `references/codex-tools.md`',
      '- Pi: `references/pi-tools.md`',
      '- Antigravity: `references/antigravity-tools.md`',
      '- Hermes Agent: `references/hermes-tools.md`',
      '- Muse: `references/muse-tools.md`',
    ].join('\n'),
    replace: [
      '## Platform Adaptation',
      '',
      'This is the DeepSeek Harness (DSH) port, mounted by the `superpowers` agent',
      'preset. The platform reference is `references/dsh-tools.md`: the Claude Code →',
      'DSH tool mapping, the DSH capabilities these skills use (`skill`, `subagent` /',
      '`subagent_fork`, `workflow`, `goal`, `todo_write`), the bundled-script rules,',
      'and the Windows `pwsh` notes. Read it before acting on any instruction below',
      'that names a tool this harness does not have.',
      '',
      'These rules are active only in a task started with the `superpowers` preset.',
      'Do not assume they apply in Standard, PTC, Minimal, or Creator mode.',
    ].join('\n'),
  },
  {
    name: 'using-superpowers: DSH instruction files',
    file: 'using-superpowers/SKILL.md',
    find: 'User instructions (CLAUDE.md, AGENTS.md, GEMINI.md, etc, direct requests) take precedence over skills, which in turn override default behavior.',
    replace: 'User instructions (`AGENTS.md` — user level at `' + DSH_HOME + '/AGENTS.md`, project level at `<project>/AGENTS.md` — and direct requests) take precedence over skills, which in turn override default behavior.',
  },
  {
    name: 'brainstorming: name the companion by its relative path',
    file: 'brainstorming/SKILL.md',
    find: '`skills/brainstorming/visual-companion.md`',
    replace: '`visual-companion.md`',
  },
  {
    name: 'brainstorming: DSH launch recipe for the visual companion',
    file: 'brainstorming/visual-companion.md',
    find: [
      '**Launching the server by platform:**',
      '',
      '**Claude Code:**',
      '```bash',
      '# Default mode works — the script backgrounds the server itself.',
      'bash scripts/start-server.sh --project-dir /path/to/project --open',
      '```',
      '',
      'On Windows, the script auto-detects and switches to foreground mode (which blocks the tool call). Use `run_in_background: true` on the Bash tool call so the server survives across conversation turns, then read `$STATE_DIR/server-info` on the next turn to get the URL and port.',
      '',
      '**Codex:**',
      '```bash',
      '# Codex reaps background processes. The script auto-detects CODEX_CI and',
      '# switches to foreground mode. Run it normally — no extra flags needed.',
      'bash scripts/start-server.sh --project-dir /path/to/project --open',
      '```',
      '',
      '**Gemini CLI:**',
      '```bash',
      '# Use --foreground and set is_background: true on your shell tool call',
      '# so the process survives across turns',
      'bash scripts/start-server.sh --project-dir /path/to/project --open --foreground',
      '```',
      '',
      '**Copilot CLI:**',
      '```bash',
      "# Start it with Copilot CLI's non-blocking/background shell mechanism so the",
      '# server survives across turns. Keep --foreground so the harness, not the',
      '# script, owns backgrounding. The launcher is a .sh, so invoke it via bash',
      "# (on Windows, call Git Bash's bash.exe from the PowerShell tool).",
      'bash scripts/start-server.sh --project-dir /path/to/project --open --foreground',
      '```',
      '',
      '**Other environments:** The server must keep running in the background across conversation turns. If your environment reaps detached processes, use `--foreground` and launch the command with your platform\'s background execution mechanism.',
    ].join('\n'),
    replace: [
      '**Launching the server on the DeepSeek Harness:**',
      '',
      'Start the server yourself and keep it alive across turns with the tool\'s own',
      'background mode. The .sh launcher is bash-only, so prefer the Node server',
      'directly when `bash` is not available:',
      '',
      '```bash',
      '# POSIX, or Windows with Git for Windows:',
      'bash scripts/start-server.sh --project-dir /path/to/project --open --foreground',
      '```',
      '',
      'On Windows, run the launcher through Git Bash, or start the Node server',
      'directly with `node scripts/server.cjs --project-dir <path> --open`. Launch it',
      'with `run_in_background: true` on the `pwsh` tool call so the process survives',
      'across conversation turns, then read `$STATE_DIR/server-info` on the next turn',
      'to get the URL and port. Stop it with `job_kill`.',
      '',
      'Do not start a second web server on a port the user is already using; bind the',
      'companion to its own port and hand over the complete URL.',
    ].join('\n'),
  },
  {
    name: 'executing-plans: DSH subagent availability',
    file: 'executing-plans/SKILL.md',
    find: [
      '- You have a plan from superpowers:writing-plans and your human partner',
      '  chose inline execution at the handoff.',
      '- Your harness has no subagent tool (see the per-platform references in',
      '  `../using-superpowers/references/`). Never fabricate a dispatch; run',
      '  the plan here.',
    ].join('\n'),
    replace: [
      '- You have a plan from superpowers:writing-plans and your human partner',
      '  chose inline (Native) execution at the handoff.',
      '- The task must stay in one context, or your human partner asked for it.',
      '  On the DeepSeek Harness `subagent` / `subagent_fork` are normally',
      '  available (see `../using-superpowers/references/dsh-tools.md`), so prefer',
      '  subagent-driven-development. Never fabricate a dispatch; run the plan here.',
    ].join('\n'),
  },
  {
    name: 'executing-plans: invoke sdd-workspace through an interpreter',
    file: 'executing-plans/SKILL.md',
    find: '`../subagent-driven-development/scripts/sdd-workspace PLAN_FILE`',
    replace: '`bash ../subagent-driven-development/scripts/sdd-workspace PLAN_FILE`',
  },
  {
    name: 'executing-plans: invoke task-start through an interpreter',
    file: 'executing-plans/SKILL.md',
    find: "Run this skill's `scripts/task-start PLAN_FILE N`.",
    replace: "Run this skill's `bash scripts/task-start PLAN_FILE N`.",
  },
  {
    name: 'executing-plans: invoke task-done through an interpreter',
    file: 'executing-plans/SKILL.md',
    find: "Run this skill's `scripts/task-done PLAN_FILE N BASE -- <test command>`",
    replace: "Run this skill's `bash scripts/task-done PLAN_FILE N BASE -- <test command>`",
  },
  {
    name: 'executing-plans: invoke review-package through an interpreter',
    file: 'executing-plans/SKILL.md',
    find: 'Run `../subagent-driven-development/scripts/review-package PLAN_FILE MERGE_BASE HEAD`',
    replace: 'Run `bash ../subagent-driven-development/scripts/review-package PLAN_FILE MERGE_BASE HEAD`',
  },
  {
    name: 'executing-plans: task-start calls task-brief through an interpreter',
    file: 'executing-plans/scripts/task-start',
    find: 'out=$("$sdd/task-brief" "$plan" "$n")',
    replace: 'out=$("${BASH:-bash}" "$sdd/task-brief" "$plan" "$n")',
  },
  {
    name: 'executing-plans: task-done calls sdd-workspace through an interpreter',
    file: 'executing-plans/scripts/task-done',
    find: 'dir=$("$sdd/sdd-workspace" "$plan")',
    replace: 'dir=$("${BASH:-bash}" "$sdd/sdd-workspace" "$plan")',
  },
  {
    name: 'using-git-worktrees: DSH has no native worktree tool',
    file: 'using-git-worktrees/SKILL.md',
    find: [
      '### 1a. Native Worktree Tools (preferred)',
      '',
      'The user has asked for an isolated workspace (Step 0 consent). Do you already have a way to create a worktree? It might be a tool with a name like `EnterWorktree`, `WorktreeCreate`, a `/worktree` command, or a `--worktree` flag. If you do, use it and skip to Step 2.',
      '',
      'Native tools handle directory placement, branch creation, and cleanup automatically. Using `git worktree add` when you have a native tool creates phantom state your harness can\'t see or manage.',
      '',
      'Only proceed to Step 1b if you have no native worktree tool available.',
    ].join('\n'),
    replace: [
      '### 1a. Native Worktree Tools',
      '',
      'The DeepSeek Harness ships no worktree tool: there is no `EnterWorktree`, no',
      '`WorktreeCreate`, no `/worktree` command, and no `--worktree` flag. Unless your',
      'human partner tells you otherwise, step 1a does not apply on this harness — go',
      'straight to the git fallback in Step 1b, which is the supported path here.',
      '',
      'A user-installed plugin could add such a tool. If you can name one that is',
      'actually available in this session, use it and skip to Step 2; do not invent one.',
    ].join('\n'),
  },
  {
    name: 'using-git-worktrees: red flag names no unavailable tool',
    file: 'using-git-worktrees/SKILL.md',
    find: '| "`git worktree add` is quicker than hunting for a native tool" | A native tool (e.g. `EnterWorktree`) owns placement, branching, and cleanup. Bypassing it is the #1 mistake — it creates phantom state your harness can\'t see or manage. |',
    replace: '| "`git worktree add` is quicker than hunting for a native tool" | On harnesses that have one, a native tool owns placement, branching, and cleanup. On DSH there is none, so Step 1b *is* the supported path — just follow it instead of improvising. |',
  },
  {
    name: 'writing-skills: point the worked example at its renamed file',
    file: 'writing-skills/testing-skills-with-subagents.md',
    find: 'examples/CLAUDE_MD_TESTING.md',
    replace: 'examples/AGENTS_MD_TESTING.md',
  },
  {
    name: 'writing-skills: the worked example speaks AGENTS.md, not CLAUDE.md',
    file: 'writing-skills/examples/CLAUDE_MD_TESTING.md',
    find: 'CLAUDE.md',
    replace: 'AGENTS.md',
    expect: 2,
  },
  {
    name: 'writing-skills: the worked example uses DSH skill roots',
    file: 'writing-skills/examples/CLAUDE_MD_TESTING.md',
    find: '~/.claude/skills/',
    replace: DSH_HOME + '/skills/',
    expect: 14,
  },
  {
    name: 'writing-skills: the worked example names no other vendor',
    file: 'writing-skills/examples/CLAUDE_MD_TESTING.md',
    find: '### Variant C: Claude.AI Emphatic Style',
    replace: '### Variant C: Emphatic, Model-Directed Style',
  },
  {
    name: 'writing-skills: the worked example addresses the agent, not a vendor',
    file: 'writing-skills/examples/CLAUDE_MD_TESTING.md',
    find: 'Claude might think it knows how to approach tasks, but the skills',
    replace: 'The agent might think it knows how to approach tasks, but the skills',
  },
  {
    name: 'writing-skills: DSH skill roots replace the cross-harness paths',
    file: 'writing-skills/SKILL.md',
    find: "**Personal skills live in your runtime's skills directory** (`~/.claude/skills/` on Claude Code) — see [codex-tools.md](../using-superpowers/references/codex-tools.md) or [gemini-tools.md](../using-superpowers/references/gemini-tools.md) for the path on those runtimes. Codex, Copilot CLI, and Gemini CLI all also recognize `~/.agents/skills/` as a cross-runtime alias.",
    replace: "**Personal skills live in your runtime's skills directory.** On the DeepSeek Harness that is `" + DSH_HOME + "/skills/` at user level, `<project>/.dsh/skills/` or `<project>/.agents/skills/` for project skills, or the `skills/` directory inside an installed plugin bundle for packaged skills. The `skill-filesystem` provider discovers all of them. See [dsh-tools.md](../using-superpowers/references/dsh-tools.md) for the full mechanism.",
  },
  {
    name: 'subagent-driven-development: the hook example uses the DSH home',
    file: 'subagent-driven-development/SKILL.md',
    find: 'You: "User level (~/.config/superpowers/hooks/)"',
    replace: 'You: "User level (' + DSH_HOME + '/)"',
  },
  {
    name: 'diagnosing-superpowers: case workspace lives under the DSH home',
    file: 'diagnosing-superpowers/SKILL.md',
    find: '`~/.superpowers/diagnosing-superpowers/<session-id>/`',
    replace: '`' + DSH_HOME + '/diagnosing-superpowers/<session-id>/`',
  },
  {
    name: 'diagnosing-superpowers: case template uses the DSH home',
    file: 'diagnosing-superpowers/templates/case.md',
    find: 'Workspace: ~/.superpowers/diagnosing-superpowers/<session-id>/',
    replace: 'Workspace: ' + DSH_HOME + '/diagnosing-superpowers/<session-id>/',
  },
  {
    name: 'diagnosing-superpowers: report template uses the DSH home',
    file: 'diagnosing-superpowers/templates/report.md',
    find: 'Report path: ~/.superpowers/diagnosing-superpowers/<session-id>/report.md',
    replace: 'Report path: ' + DSH_HOME + '/diagnosing-superpowers/<session-id>/report.md',
  },
  {
    name: 'diagnosing-superpowers: DSH session discovery facts',
    file: 'diagnosing-superpowers/references/session-discovery.md',
    find: 'limitation and ask for the missing path, export, or identifying detail.',
    replace: [
      'limitation and ask for the missing path, export, or identifying detail.',
      '',
      '## DeepSeek Harness',
      '',
      'Verified against DSH 0.2.1-alpha.1; confirm it against the records you actually read.',
      '',
      '- Transcripts: `' + DSH_HOME + '/sessions/<slugified-cwd>/session-<uuid>/session*.jsonl.zstd`',
      '  (`' + DSH_HOME + '` defaults to `~/.dsh`). The slug is the working directory with',
      '  separators and non-alphanumeric characters folded to `-`, wrapped in `--`.',
      '- Child sessions dispatched through `subagent` / `subagent_fork` are peer',
      '  directories under the same slug whose header record carries `delegationDepth: 1`.',
      '- The schema version is in the filename (`session.v4.jsonl.zstd`; older files are',
      '  `session.v3.jsonl.zstd` or `session.jsonl.zstd`). Read the header record\'s',
      '  `version` instead of guessing from the name.',
      '- Each file concatenates independent zstd frames, and the `zstd` CLI is usually',
      '  absent. See `../using-superpowers/references/dsh-tools.md` for the frame-by-frame',
      '  Node decompression command.',
      '- Records are JSON lines carrying `type`, `seq`, `time`, and `data`. Establish what',
      '  each type means from the records themselves — never import a meaning from another',
      '  harness.',
    ].join('\n'),
  },
]

const TEXT_EXTENSIONS = new Set([
  '.md', '.markdown', '.txt', '.js', '.cjs', '.mjs', '.ts', '.sh', '.dot', '.html', '.json', '.yml', '.yaml',
])

/** @returns {Promise<string[]>} repo-relative paths of every file under `root`. */
async function walk(root, current = root) {
  const out = []
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const full = join(current, entry.name)
    if (entry.isDirectory()) out.push(...(await walk(root, full)))
    else out.push(relative(root, full).split(sep).join('/'))
  }
  return out
}

/** Whether a synced file should be decoded and rewritten as text. */
function isTextFile(rel) {
  const dot = rel.lastIndexOf('.')
  const slash = rel.lastIndexOf('/')
  if (dot <= slash) return true
  return TEXT_EXTENSIONS.has(rel.slice(dot))
}

/** Abort the sync, leaving the previous `skills/` tree untouched. */
function fail(message) {
  console.error(`\n[sync-from-upstream] FAIL: ${message}\n`)
  process.exit(1)
}

/** Apply every transform naming `rel`, asserting each anchor's occurrence count. */
function applyTransforms(rel, text, applied) {
  for (const transform of TRANSFORMS) {
    if (transform.file !== rel) continue
    const expected = transform.expect ?? 1
    const count = text.split(transform.find).length - 1
    if (count !== expected) {
      fail(
        `anchor for "${transform.name}" matched ${count} time(s) in ${rel}, expected ${expected}.\n` +
        `  find: ${JSON.stringify(transform.find.slice(0, 160))}\n` +
        '  Upstream changed this text; decide the DSH wording and update TRANSFORMS.',
      )
    }
    text = text.replaceAll(transform.find, transform.replace)
    applied.add(transform.name)
  }
  return text
}

const upstreamArg = process.argv[2]
if (!upstreamArg) {
  console.error('usage: node scripts/sync-from-upstream.mjs <path-to-superpowers-checkout>')
  process.exit(2)
}
const upstreamRoot = resolve(upstreamArg)
const upstreamSkills = join(upstreamRoot, 'skills')

if (!(await stat(upstreamSkills).catch(() => null))?.isDirectory()) {
  fail(`no skills/ directory in ${upstreamRoot}`)
}

// A change in the upstream skill set changes the catalog, the README tables,
// and possibly the DSH adaptations, so it must be a deliberate decision.
const upstreamSkillDirs = (await readdir(upstreamSkills, { withFileTypes: true }))
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
  .sort()
if (upstreamSkillDirs.join('\n') !== [...UPSTREAM_SKILLS].sort().join('\n')) {
  const added = upstreamSkillDirs.filter(name => !UPSTREAM_SKILLS.includes(name))
  const removed = UPSTREAM_SKILLS.filter(name => !upstreamSkillDirs.includes(name))
  fail(
    'the upstream skill set changed — decide before syncing:\n' +
    (added.length > 0 ? `  added upstream:   ${added.join(', ')}\n` : '') +
    (removed.length > 0 ? `  removed upstream: ${removed.join(', ')}\n` : '') +
    '  Update UPSTREAM_SKILLS here, then the skill tables in README.md and README.en.md.',
  )
}

/** Upstream records its version in the plugin manifest. */
async function upstreamVersion() {
  for (const candidate of ['.claude-plugin/plugin.json', 'package.json']) {
    try {
      const manifest = JSON.parse(await readFile(join(upstreamRoot, candidate), 'utf8'))
      if (typeof manifest.version === 'string') return manifest.version
    } catch {
      /* try the next manifest */
    }
  }
  return 'unknown'
}

await rm(stagingSkills, { recursive: true, force: true })
await mkdir(stagingSkills, { recursive: true })

const applied = new Set()
let copied = 0
let stripped = 0

for (const rel of await walk(upstreamSkills)) {
  if (SKIP.includes(rel)) continue
  const source = join(upstreamSkills, rel)
  const target = join(stagingSkills, RENAMES.get(rel) ?? rel)
  await mkdir(dirname(target), { recursive: true })

  if (!isTextFile(rel)) {
    await cp(source, target)
    copied++
    continue
  }

  let text = await readFile(source, 'utf8')
  text = applyTransforms(rel, text, applied)

  const namespaced = text.split('superpowers:').length - 1
  if (namespaced > 0) {
    text = text.replaceAll('superpowers:', '')
    stripped += namespaced
  }

  await writeFile(target, text, 'utf8')
  copied++
}

// Files this port owns outright, or DSH-only files upstream has no counterpart
// for, are laid over the synced tree last so a re-sync can never drop them.
let overridden = 0
for (const rel of await walk(overridesRoot)) {
  const target = join(stagingSkills, rel)
  await mkdir(dirname(target), { recursive: true })
  await cp(join(overridesRoot, rel), target)
  overridden++
}

const unfired = TRANSFORMS.filter(transform => !applied.has(transform.name))
if (unfired.length > 0) {
  fail(`transform(s) never matched a copied file: ${unfired.map(t => `${t.name} (${t.file})`).join('; ')}`)
}

// Everything applied: swap the staging tree in.
await rm(destSkills, { recursive: true, force: true })
await rename(stagingSkills, destSkills)

const version = await upstreamVersion()
const pkg = JSON.parse(await readFile(join(pkgRoot, 'package.json'), 'utf8'))
const recorded = pkg.dsh?.superpowersUpstream?.tag
if (recorded !== `v${version}`) {
  console.warn(
    `[sync-from-upstream] warn: package.json records dsh.superpowersUpstream.tag="${recorded}" ` +
    `but the checkout reports "v${version}".\n` +
    '                     Update package.json, CHANGELOG.md, README.md and README.en.md, then re-run the sync.',
  )
}

console.log(`[sync-from-upstream] synced ${copied} upstream files from obra/superpowers v${version}`)
console.log(`[sync-from-upstream]   namespace prefixes stripped: ${stripped}`)
console.log(`[sync-from-upstream]   transforms applied: ${applied.size}/${TRANSFORMS.length}`)
console.log(`[sync-from-upstream]   port-owned files overlaid: ${overridden}`)

// The persona prefix is the bootstrap; it must follow the skill file, or the
// preset ships one text and the mode's own copy of the skill shows another.
const { syncBootstrap } = await import('./sync-bootstrap.mjs')
const alreadyCurrent = await syncBootstrap({ write: true })
console.log(alreadyCurrent
  ? '[sync-from-upstream]   persona bootstrap already current in cordis.patch.yml'
  : '[sync-from-upstream]   persona bootstrap rewritten in cordis.patch.yml')
console.log('[sync-from-upstream] next: node scripts/verify.mjs')
