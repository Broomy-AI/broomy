<!--
Thanks for contributing! Fill in the sections below.

CI requires the `## Testing` heading to remain spelled exactly that way and
the E2E item under it to be checked (`- [x]`). The "PR E2E attestation" job
greps for both — see .github/workflows/ci.yml.
-->

## Background and Motivation

<!-- What problem does this solve? Link issues, screenshots, or repro steps. -->

## Design Decisions

<!-- Non-obvious choices and the alternatives you considered. Skip if trivial. -->

## Proposed Changes

<!-- Group by pattern (component, layer, behavior), not just file lists. -->

## Testing

<!--
Run `/validate` (or the equivalent: `pnpm lint && pnpm typecheck && pnpm check:all && pnpm test:unit:coverage && pnpm test:e2e`).

E2E tests are required on every PR. Run `pnpm test:e2e` locally on your OS;
use `./run-linux-e2e.sh` only when you specifically need to reproduce a
Linux/CI-only failure.
-->

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm check:all`
- [ ] `pnpm test:unit` (coverage at or above 90% lines)
- [ ] Ran all E2E tests locally (`pnpm test:e2e`)
