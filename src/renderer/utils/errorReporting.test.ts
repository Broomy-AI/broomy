import { describe, it, expect } from 'vitest'
import { buildGitHubIssueUrl } from './errorReporting'

describe('buildGitHubIssueUrl', () => {
  it('builds a valid URL with all params', () => {
    const url = buildGitHubIssueUrl({
      title: '[Bug] Something broke',
      errorMessage: 'ENOSPC: no space left',
      category: 'disk',
      appVersion: '1.2.3',
      platform: 'darwin',
      detail: 'Full stack trace here',
    })

    expect(url).toContain('github.com/Broomy-AI/broomy/issues/new')
    expect(url).toContain('template=bug_report.yml')
    expect(url).toContain('title=%5BBug%5D+Something+broke')
    expect(url).toContain('error-message=ENOSPC')
    expect(url).toContain('category=disk')
    expect(url).toContain('version=1.2.3')
    expect(url).toContain('os=darwin')
    expect(url).toContain('detail=Full+stack+trace+here')
  })

  it('builds a URL with only required params', () => {
    const url = buildGitHubIssueUrl({
      title: '[Bug] Error',
      errorMessage: 'Something failed',
    })

    expect(url).toContain('github.com/Broomy-AI/broomy/issues/new')
    expect(url).toContain('template=bug_report.yml')
    expect(url).toContain('title=%5BBug%5D+Error')
    expect(url).toContain('error-message=Something+failed')
    expect(url).not.toContain('category=')
    expect(url).not.toContain('version=')
  })
})
