/**
 * Host half of `dsh-superpowers-preset`.
 *
 * This module deliberately does nothing at the host layer, and the emptiness
 * is load-bearing rather than an unfinished stub:
 *
 *   - The agent preset is declared by `cordis.patch.yml`, not by code. The row
 *     it inserts names `@deepseek-ai/dsh-agent-preset`, which the harness
 *     already ships.
 *   - The skill provider is a *separate* module (`./skills.js`, exported as
 *     `dsh-superpowers-preset/skills`) because the preset mounts it into its
 *     own scope. Host-layer skill registration is global — it would put the
 *     Superpowers catalog in every session's system prompt, which is exactly
 *     the behaviour this package exists to avoid.
 *
 * **Nothing currently mounts this module.** The patch inserts the preset
 * declaration and nothing else, so `dsh-superpowers-preset` never appears as a
 * loader row. This file is the reserved host half for the planned browser half
 * (`./client.js`): a bundle that ships a client module needs a loader row, that
 * row needs an `apply`, and the `apply` must keep its hands off the host. Until
 * that lands, `main`/`exports["."]` exist only so the shape is ready.
 *
 * @module dsh-superpowers-preset
 */

/** Host apply: intentionally no host-layer behaviour. */
export function apply() {}

export default { apply }
