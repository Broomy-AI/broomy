let cachedHome: string | null = null

async function getHome(): Promise<string> {
  if (cachedHome) return cachedHome
  cachedHome = await window.app.homedir()
  return cachedHome
}

export async function getUserCommandsConfigPath(): Promise<string> {
  const home = await getHome()
  return `${home}/.broomy/commands.json`
}

export function userCommandsDir(home: string): string {
  return `${home}/.broomy`
}

/** Test-only: clear memoised home dir. */
export function _resetUserCommandsCacheForTest(): void {
  cachedHome = null
}
