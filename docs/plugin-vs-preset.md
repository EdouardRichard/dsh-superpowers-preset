# Compared with the plugin approach

Superpowers can reach a DeepSeek Harness in more than one way. This page lays out
the difference so you can pick deliberately. Neither is better in the abstract —
they answer different questions.

- **[superpowers-dsh](https://github.com/LayneChai/superpowers-dsh)** mounts the
  skills as an ordinary **Host plugin row**. That is the plugin approach.
- **This project** declares an **agent preset**. That is the preset approach.

## The one structural difference

`ctx.skills.registerProvider()` files a registration into the layer of the
calling context's scope:

- a **Host** row lands in the **global** layer, which every session reads;
- a row mounted by an **agent preset's standing composition** lands in **that
  preset's layer alone**, which only sessions created from that preset read.

Everything else follows from that one line. The same API, the same provider
protocol, the same skill files — different placement.

## Side by side

| | Host plugin | Agent preset (this project) |
| --- | --- | --- |
| Who sees the skills | Every session in the profile | Only tasks started with the mode |
| Skill catalog tokens when unused | Paid in every session | Zero |
| How the workflow rules reach the model | Whichever channel the plugin uses (session-start context, or the catalog description alone) | The preset's system prompt (persona), re-sent on every request |
| After context compaction | An injected session-start message can be trimmed away | Unaffected: the system prompt is rebuilt for each request |
| Turning it on | Install the bundle; it is profile-wide | Pick the mode when starting a task |
| Turning it off | Disable or remove the bundle, then restart | Start the task in another mode |
| Different rules per kind of work | Needs the plugin to implement its own gating | The mode *is* the gate; you can install several presets |
| Upgrade surface | Host composition | Preset declaration plus a scoped provider |

## Which to choose

**Choose the plugin approach when** you want Superpowers to be part of how your
harness always works, and you are happy for the catalog to be present in every
session — for example a single-purpose coding profile.

**Choose the preset approach when** you want Superpowers to be a deliberate choice
per task: a repository where some work is coding and some is not, a profile that
also runs research or operations tasks, or a team that wants the methodology
available without every unrelated conversation carrying it.

Adding Superpowers to a session costs tokens: the catalog descriptions, and — in
this preset — the bootstrap in the system prompt. Whether that is waste or value
depends entirely on whether the task is one Superpowers applies to. That is the
whole argument for scoping it to a mode you choose.

## Can both be installed at once?

Yes, and they coexist without conflict. Duplicate skill names resolve by
proximity first: the preset's layer is nearer to the session than the global
layer, so inside a Superpowers task the preset's copy wins, and outside one the
host copy is all that exists.

If you only want one of them, disable the other. In a profile that uses this
preset, there is usually no reason to keep the host-wide one enabled as well —
that just puts the catalog back into every session.

## Credit where it is due

The plugin approach came first for DSH, and its port did the unglamorous work of
adapting the upstream skills to this harness: namespace removal, the Claude Code
→ DSH tool mapping, `$DSH_HOME` path rewrites, the transcript-decompression
recipe, and interpreter-prefixed script invocations. This project reuses that
knowledge — and keeps its own copy of the adaptations, written independently and
replayed by `scripts/sync-from-upstream.mjs` — but it does not depend on that
package at runtime. Install either, install both, or neither.
