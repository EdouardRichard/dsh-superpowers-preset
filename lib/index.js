/**
 * Host half of `superpowers-preset-dsh`.
 *
 * This module deliberately does nothing at the host layer, and the emptiness
 * is load-bearing rather than an unfinished stub:
 *
 *   - The agent preset is declared by `cordis.patch.yml`, not by code. The row
 *     it inserts names `@deepseek-ai/dsh-agent-preset`, which the harness
 *     already ships.
 *   - The skill provider is a *separate* module (`./skills.js`, exported as
 *     `superpowers-preset-dsh/skills`) because the preset mounts it into its
 *     own scope. Host-layer skill registration is global — it would put the
 *     Superpowers catalog in every session's system prompt, which is exactly
 *     the behaviour this package exists to avoid.
 *   - This row exists so the bundle can also carry a browser half
 *     (`./client.js`), which the client module loader resolves from this
 *     package's `dsh.client` manifest. A bundle with a client half needs a
 *     loader row; the row needs an apply function; the apply function needs to
 *     keep its hands off the host.
 *
 * @module superpowers-preset-dsh
 */

/** Host apply: intentionally no host-layer behaviour. */
export function apply() {}

export default { apply }
