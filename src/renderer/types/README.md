# Types

Shared TypeScript type definitions for the Broomy renderer. These types are imported by components, stores, and utilities that deal with code review functionality.

## How It Connects

The `ReviewData` type is produced by the review agent and consumed by the review panel components. `PendingComment` and `ReviewComparison` types are used by the Explorer's source-control view and the review session workflow. The types are purely structural -- no runtime code -- and serve as the contract between the review generation logic and the UI that renders review results.

## Files

| File | Description |
|------|-------------|
| `review.ts` | Type definitions for code reviews: `ReviewData` (overview, change patterns, potential issues, design decisions, requested changes), `ReviewComparison` (diff between reviews), `PendingComment` (draft PR comments), `ReviewHistory`, and supporting types like `CodeLocation` and `RequestedChange`. |
