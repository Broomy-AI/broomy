import type { ErrorCategory } from './errorMessages'

const REPO_URL = 'https://github.com/Broomy-AI/broomy'

export interface IssueParams {
  title: string
  errorMessage: string
  category?: ErrorCategory
  detail?: string
  appVersion?: string
  platform?: string
}

export function buildGitHubIssueUrl(params: IssueParams): string {
  const searchParams = new URLSearchParams()

  searchParams.set('template', 'bug_report.yml')
  searchParams.set('title', params.title)

  if (params.errorMessage) {
    searchParams.set('error-message', params.errorMessage)
  }
  if (params.category) {
    searchParams.set('category', params.category)
  }
  if (params.appVersion) {
    searchParams.set('version', params.appVersion)
  }
  if (params.platform) {
    searchParams.set('os', params.platform)
  }
  if (params.detail) {
    searchParams.set('detail', params.detail)
  }

  return `${REPO_URL}/issues/new?${searchParams.toString()}`
}

export async function openReportIssue(errorMessage: string, category?: ErrorCategory): Promise<void> {
  let appVersion = 'unknown'
  let platform = 'unknown'

  try {
    appVersion = await window.app.version()
  } catch {
    // ignore
  }
  try {
    platform = await window.app.platform()
  } catch {
    // ignore
  }

  const url = buildGitHubIssueUrl({
    title: `[Bug] ${errorMessage.slice(0, 80)}`,
    errorMessage,
    category,
    appVersion,
    platform,
  })

  await window.shell.openExternal(url)
}
