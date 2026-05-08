/**
 * Shared utility functions used across handler modules.
 */

/** Safely extract an error message string from an unknown thrown value. */
export function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
