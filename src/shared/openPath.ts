/**
 * Result of `shell:openPath` — shared between the main handler and the preload type so both
 * agree on the shape. `opened` = handed to the OS default app; `revealed` = shown in the file
 * manager (non-regular file, or an extension outside the native-open allowlist); `none` = the
 * path didn't resolve or doesn't exist; `failed` = an fs/open error worth surfacing.
 */
export interface OpenPathResult {
  action: 'opened' | 'revealed' | 'none' | 'failed'
  error?: string
}
