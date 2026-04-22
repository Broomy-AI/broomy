/**
 * Code-level feature flags.
 *
 * Flip these to enable/disable features at build time.
 * They are simple boolean constants so bundlers can tree-shake
 * dead branches when the flag is `false`.
 */

/** When false, all Agent SDK / API-mode functionality is hidden and inactive. */
// eslint-disable-next-line @typescript-eslint/no-inferrable-types -- explicit type prevents literal narrowing so feature-flag checks don't trigger no-unnecessary-condition
export const ENABLE_AGENT_SDK: boolean = false
