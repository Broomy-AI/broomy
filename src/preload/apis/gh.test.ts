import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockInvoke = vi.fn()
vi.mock('electron', () => ({
  ipcRenderer: {
    invoke: (...args: unknown[]) => mockInvoke(...args),
  },
}))

import { ghApi } from './gh'

describe('preload gh API', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    mockInvoke.mockResolvedValue(undefined)
  })

  it('isInstalled invokes gh:isInstalled', async () => {
    await ghApi.isInstalled()
    expect(mockInvoke).toHaveBeenCalledWith('gh:isInstalled')
  })

  it('issues invokes gh:issues', async () => {
    await ghApi.issues('/repo')
    expect(mockInvoke).toHaveBeenCalledWith('gh:issues', '/repo')
  })

  it('repoSlug invokes gh:repoSlug', async () => {
    await ghApi.repoSlug('/repo')
    expect(mockInvoke).toHaveBeenCalledWith('gh:repoSlug', '/repo')
  })

  it('prStatus invokes gh:prStatus', async () => {
    await ghApi.prStatus('/repo')
    expect(mockInvoke).toHaveBeenCalledWith('gh:prStatus', '/repo')
  })

  it('hasWriteAccess invokes gh:hasWriteAccess', async () => {
    await ghApi.hasWriteAccess('/repo')
    expect(mockInvoke).toHaveBeenCalledWith('gh:hasWriteAccess', '/repo')
  })

  it('mergeBranchToMain invokes gh:mergeBranchToMain', async () => {
    await ghApi.mergeBranchToMain('/repo')
    expect(mockInvoke).toHaveBeenCalledWith('gh:mergeBranchToMain', '/repo')
  })

  it('getPrCreateUrl invokes gh:getPrCreateUrl', async () => {
    await ghApi.getPrCreateUrl('/repo')
    expect(mockInvoke).toHaveBeenCalledWith('gh:getPrCreateUrl', '/repo')
  })

  it('prComments invokes gh:prComments', async () => {
    await ghApi.prComments('/repo', 42)
    expect(mockInvoke).toHaveBeenCalledWith('gh:prComments', '/repo', 42)
  })

  it('replyToComment invokes gh:replyToComment', async () => {
    await ghApi.replyToComment('/repo', 42, 1, 'reply')
    expect(mockInvoke).toHaveBeenCalledWith('gh:replyToComment', '/repo', 42, 1, 'reply')
  })

  it('prsToReview invokes gh:prsToReview', async () => {
    await ghApi.prsToReview('/repo')
    expect(mockInvoke).toHaveBeenCalledWith('gh:prsToReview', '/repo')
  })

  it('submitDraftReview invokes gh:submitDraftReview', async () => {
    const comments = [{ path: 'file.ts', line: 1, body: 'comment' }]
    await ghApi.submitDraftReview('/repo', 42, comments)
    expect(mockInvoke).toHaveBeenCalledWith('gh:submitDraftReview', '/repo', 42, comments)
  })
})
