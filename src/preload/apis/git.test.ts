import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockInvoke = vi.fn()
vi.mock('electron', () => ({
  ipcRenderer: {
    invoke: (...args: unknown[]) => mockInvoke(...args),
  },
}))

import { gitApi } from './git'

describe('preload git API', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    mockInvoke.mockResolvedValue(undefined)
  })

  it('isInstalled invokes git:isInstalled', async () => {
    await gitApi.isInstalled()
    expect(mockInvoke).toHaveBeenCalledWith('git:isInstalled')
  })

  it('getBranch invokes git:getBranch', async () => {
    await gitApi.getBranch('/repo')
    expect(mockInvoke).toHaveBeenCalledWith('git:getBranch', '/repo')
  })

  it('isGitRepo invokes git:isGitRepo', async () => {
    await gitApi.isGitRepo('/repo')
    expect(mockInvoke).toHaveBeenCalledWith('git:isGitRepo', '/repo')
  })

  it('status invokes git:status', async () => {
    await gitApi.status('/repo')
    expect(mockInvoke).toHaveBeenCalledWith('git:status', '/repo')
  })

  it('diff invokes git:diff with optional filePath', async () => {
    await gitApi.diff('/repo', 'file.ts')
    expect(mockInvoke).toHaveBeenCalledWith('git:diff', '/repo', 'file.ts')
  })

  it('show invokes git:show with optional ref', async () => {
    await gitApi.show('/repo', 'file.ts', 'HEAD~1')
    expect(mockInvoke).toHaveBeenCalledWith('git:show', '/repo', 'file.ts', 'HEAD~1')
  })

  it('stage invokes git:stage', async () => {
    await gitApi.stage('/repo', 'file.ts')
    expect(mockInvoke).toHaveBeenCalledWith('git:stage', '/repo', 'file.ts')
  })

  it('stageAll invokes git:stageAll', async () => {
    await gitApi.stageAll('/repo')
    expect(mockInvoke).toHaveBeenCalledWith('git:stageAll', '/repo')
  })

  it('unstage invokes git:unstage', async () => {
    await gitApi.unstage('/repo', 'file.ts')
    expect(mockInvoke).toHaveBeenCalledWith('git:unstage', '/repo', 'file.ts')
  })

  it('checkoutFile invokes git:checkoutFile', async () => {
    await gitApi.checkoutFile('/repo', 'file.ts')
    expect(mockInvoke).toHaveBeenCalledWith('git:checkoutFile', '/repo', 'file.ts')
  })

  it('commit invokes git:commit', async () => {
    await gitApi.commit('/repo', 'msg')
    expect(mockInvoke).toHaveBeenCalledWith('git:commit', '/repo', 'msg')
  })

  it('push invokes git:push', async () => {
    await gitApi.push('/repo')
    expect(mockInvoke).toHaveBeenCalledWith('git:push', '/repo')
  })

  it('pull invokes git:pull', async () => {
    await gitApi.pull('/repo')
    expect(mockInvoke).toHaveBeenCalledWith('git:pull', '/repo')
  })

  it('clone invokes git:clone', async () => {
    await gitApi.clone('url', '/dir')
    expect(mockInvoke).toHaveBeenCalledWith('git:clone', 'url', '/dir')
  })

  it('worktreeAdd invokes git:worktreeAdd', async () => {
    await gitApi.worktreeAdd('/repo', '/wt', 'branch', 'main')
    expect(mockInvoke).toHaveBeenCalledWith('git:worktreeAdd', '/repo', '/wt', 'branch', 'main')
  })

  it('worktreeList invokes git:worktreeList', async () => {
    await gitApi.worktreeList('/repo')
    expect(mockInvoke).toHaveBeenCalledWith('git:worktreeList', '/repo')
  })

  it('worktreeRemove invokes git:worktreeRemove', async () => {
    await gitApi.worktreeRemove('/repo', '/wt')
    expect(mockInvoke).toHaveBeenCalledWith('git:worktreeRemove', '/repo', '/wt')
  })

  it('deleteBranch invokes git:deleteBranch', async () => {
    await gitApi.deleteBranch('/repo', 'branch')
    expect(mockInvoke).toHaveBeenCalledWith('git:deleteBranch', '/repo', 'branch')
  })

  it('pushNewBranch invokes git:pushNewBranch', async () => {
    await gitApi.pushNewBranch('/repo', 'branch')
    expect(mockInvoke).toHaveBeenCalledWith('git:pushNewBranch', '/repo', 'branch')
  })

  it('defaultBranch invokes git:defaultBranch', async () => {
    await gitApi.defaultBranch('/repo')
    expect(mockInvoke).toHaveBeenCalledWith('git:defaultBranch', '/repo')
  })

  it('remoteUrl invokes git:remoteUrl', async () => {
    await gitApi.remoteUrl('/repo')
    expect(mockInvoke).toHaveBeenCalledWith('git:remoteUrl', '/repo')
  })

  it('branchChanges invokes git:branchChanges', async () => {
    await gitApi.branchChanges('/repo', 'main')
    expect(mockInvoke).toHaveBeenCalledWith('git:branchChanges', '/repo', 'main')
  })

  it('branchCommits invokes git:branchCommits', async () => {
    await gitApi.branchCommits('/repo', 'main')
    expect(mockInvoke).toHaveBeenCalledWith('git:branchCommits', '/repo', 'main')
  })

  it('commitFiles invokes git:commitFiles', async () => {
    await gitApi.commitFiles('/repo', 'abc123')
    expect(mockInvoke).toHaveBeenCalledWith('git:commitFiles', '/repo', 'abc123')
  })

  it('headCommit invokes git:headCommit', async () => {
    await gitApi.headCommit('/repo')
    expect(mockInvoke).toHaveBeenCalledWith('git:headCommit', '/repo')
  })

  it('listBranches invokes git:listBranches', async () => {
    await gitApi.listBranches('/repo')
    expect(mockInvoke).toHaveBeenCalledWith('git:listBranches', '/repo')
  })

  it('fetchBranch invokes git:fetchBranch', async () => {
    await gitApi.fetchBranch('/repo', 'branch')
    expect(mockInvoke).toHaveBeenCalledWith('git:fetchBranch', '/repo', 'branch')
  })

  it('fetchPrHead invokes git:fetchPrHead', async () => {
    await gitApi.fetchPrHead('/repo', 42, 'target')
    expect(mockInvoke).toHaveBeenCalledWith('git:fetchPrHead', '/repo', 42, 'target')
  })

  it('pullPrBranch invokes git:pullPrBranch', async () => {
    await gitApi.pullPrBranch('/repo', 'branch', 42)
    expect(mockInvoke).toHaveBeenCalledWith('git:pullPrBranch', '/repo', 'branch', 42)
  })

  it('isMergedInto invokes git:isMergedInto', async () => {
    await gitApi.isMergedInto('/repo', 'main')
    expect(mockInvoke).toHaveBeenCalledWith('git:isMergedInto', '/repo', 'main')
  })

  it('hasBranchCommits invokes git:hasBranchCommits', async () => {
    await gitApi.hasBranchCommits('/repo', 'main')
    expect(mockInvoke).toHaveBeenCalledWith('git:hasBranchCommits', '/repo', 'main')
  })

  it('pullOriginMain invokes git:pullOriginMain', async () => {
    await gitApi.pullOriginMain('/repo')
    expect(mockInvoke).toHaveBeenCalledWith('git:pullOriginMain', '/repo')
  })

  it('isBehindMain invokes git:isBehindMain', async () => {
    await gitApi.isBehindMain('/repo')
    expect(mockInvoke).toHaveBeenCalledWith('git:isBehindMain', '/repo')
  })

  it('getConfig invokes git:getConfig', async () => {
    await gitApi.getConfig('/repo', 'user.name')
    expect(mockInvoke).toHaveBeenCalledWith('git:getConfig', '/repo', 'user.name')
  })

  it('setConfig invokes git:setConfig', async () => {
    await gitApi.setConfig('/repo', 'user.name', 'Test')
    expect(mockInvoke).toHaveBeenCalledWith('git:setConfig', '/repo', 'user.name', 'Test')
  })
})
