import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { FileEntry, GitFileStatus, GitStatusResult, SearchResult, GitHubPrStatus, GitCommitInfo } from '../../preload/index'
import type { ExplorerFilter, BranchStatus, PrState } from '../store/sessions'
import { useRepoStore } from '../store/repos'
import { statusLabel, getStatusColor, statusBadgeColor, prStateBadgeClass } from '../utils/explorerHelpers'

// PR comment type from GitHub API
type PrComment = {
  id: number
  body: string
  path: string
  line: number | null
  side: 'LEFT' | 'RIGHT'
  author: string
  createdAt: string
  url: string
  inReplyToId?: number
}

interface ExplorerProps {
  directory?: string
  onFileSelect?: (filePath: string, openInDiffMode: boolean, scrollToLine?: number, searchHighlight?: string, diffBaseRef?: string, diffCurrentRef?: string, diffLabel?: string) => void
  selectedFilePath?: string | null
  gitStatus?: GitFileStatus[]
  syncStatus?: GitStatusResult | null
  filter: ExplorerFilter
  onFilterChange: (filter: ExplorerFilter) => void
  onGitStatusRefresh?: () => void
  recentFiles?: string[]
  // Push to main tracking
  sessionId?: string
  pushedToMainAt?: number
  pushedToMainCommit?: string
  onRecordPushToMain?: (commitHash: string) => void
  onClearPushToMain?: () => void
  // Plan file
  planFilePath?: string | null
  // Branch status
  branchStatus?: BranchStatus
  onUpdatePrState?: (prState: PrState, prNumber?: number, prUrl?: string) => void
  repoId?: string
}

interface TreeNode extends FileEntry {
  children?: TreeNode[]
  isExpanded?: boolean
}

interface SearchTreeNode {
  name: string
  path: string
  children: SearchTreeNode[]
  results: SearchResult[]
}

// Inline SVG icons
const FileTreeIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M1.5 1h3l1 1H14v11H1.5V1zm1 1v10h10V3H5.5l-1-1H2.5z" />
    <path d="M4 6h8v1H4zm0 2h6v1H4z" />
  </svg>
)

const SourceControlIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="18" r="3" />
    <circle cx="6" cy="6" r="3" />
    <path d="M6 21V9a9 9 0 0 0 9 9" />
  </svg>
)

const SearchIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z" />
  </svg>
)

const RecentIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
)

// statusLabel imported from utils/explorerHelpers

// Status letter badge
const StatusBadge = ({ status }: { status: string }) => {
  const letter = status.charAt(0).toUpperCase()
  const color = statusBadgeColor(status)
  return <span className={`text-xs font-mono ${color}`} title={statusLabel(status)}>{letter}</span>
}

// getStatusColor imported from utils/explorerHelpers

function BranchStatusCard({ status }: { status: BranchStatus }) {
  const config: Record<string, { label: string; chipClasses: string; description: string }> = {
    pushed: {
      label: 'PUSHED',
      chipClasses: 'bg-blue-500/20 text-blue-400',
      description: 'Changes pushed to remote. Consider creating a PR.',
    },
    open: {
      label: 'PR OPEN',
      chipClasses: 'bg-green-500/20 text-green-400',
      description: 'Pull request is open.',
    },
    merged: {
      label: 'MERGED',
      chipClasses: 'bg-purple-500/20 text-purple-400',
      description: 'Merged into main.',
    },
    closed: {
      label: 'CLOSED',
      chipClasses: 'bg-red-500/20 text-red-400',
      description: 'PR was closed.',
    },
  }

  const c = config[status]
  if (!c) return null

  return (
    <div className="flex flex-col items-center gap-2">
      <span className={`text-xs px-2 py-1 rounded font-medium ${c.chipClasses}`}>
        {c.label}
      </span>
      <span className="text-xs text-text-secondary text-center">{c.description}</span>
    </div>
  )
}

export default function Explorer({
  directory,
  onFileSelect,
  selectedFilePath,
  gitStatus = [],
  syncStatus,
  filter,
  onFilterChange,
  onGitStatusRefresh,
  recentFiles = [],
  sessionId: _sessionId,
  pushedToMainAt,
  pushedToMainCommit,
  onRecordPushToMain,
  onClearPushToMain,
  planFilePath,
  branchStatus,
  onUpdatePrState,
  repoId,
}: ExplorerProps) {
  const [tree, setTree] = useState<TreeNode[]>([])
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(false)

  // Context menu state for inline creation
  const [inlineInput, setInlineInput] = useState<{ parentPath: string; type: 'file' | 'folder' } | null>(null)
  const [inlineInputValue, setInlineInputValue] = useState('')
  const inlineInputRef = useRef<HTMLInputElement>(null)

  // Source control state
  const [commitMessage, setCommitMessage] = useState('')
  const [isCommitting, setIsCommitting] = useState(false)
  const [commitError, setCommitError] = useState<string | null>(null)
  const [commitErrorExpanded, setCommitErrorExpanded] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [gitOpError, setGitOpError] = useState<{ operation: string; message: string } | null>(null)
  const [scView, setScView] = useState<'working' | 'branch' | 'commits' | 'comments'>('working')
  const [branchChanges, setBranchChanges] = useState<{ path: string; status: string }[]>([])
  const [branchBaseName, setBranchBaseName] = useState<string>('main')
  const [isBranchLoading, setIsBranchLoading] = useState(false)

  // Commits state
  const [branchCommits, setBranchCommits] = useState<GitCommitInfo[]>([])
  const [isCommitsLoading, setIsCommitsLoading] = useState(false)
  const [expandedCommits, setExpandedCommits] = useState<Set<string>>(new Set())
  const [commitFilesByHash, setCommitFilesByHash] = useState<Record<string, { path: string; status: string }[]>>({})
  const [loadingCommitFiles, setLoadingCommitFiles] = useState<Set<string>>(new Set())

  // PR status state
  const [prStatus, setPrStatus] = useState<GitHubPrStatus>(null)
  const [isPrLoading, setIsPrLoading] = useState(false)
  const [hasWriteAccess, setHasWriteAccess] = useState(false)
  const [isPushingToMain, setIsPushingToMain] = useState(false)
  const [currentHeadCommit, setCurrentHeadCommit] = useState<string | null>(null)

  // PR comments state
  const [prComments, setPrComments] = useState<PrComment[]>([])
  const [isCommentsLoading, setIsCommentsLoading] = useState(false)
  const [replyText, setReplyText] = useState<Record<number, string>>({})
  const [isSubmittingReply, setIsSubmittingReply] = useState<number | null>(null)

  // Repo lookup for allowPushToMain
  const repos = useRepoStore((s) => s.repos)
  const currentRepo = repoId ? repos.find((r) => r.id === repoId) : undefined

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [collapsedSearchGroups, setCollapsedSearchGroups] = useState<Set<string>>(new Set())
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset source control state when directory (session) changes
  useEffect(() => {
    setPrComments([])
    setPrStatus(null)
    setScView('working')
    setHasWriteAccess(false)
    setCommitError(null)
    setGitOpError(null)
    setBranchCommits([])
    setExpandedCommits(new Set())
    setCommitFilesByHash({})
    setLoadingCommitFiles(new Set())
  }, [directory])

  // Load directory contents
  const loadDirectory = useCallback(async (dirPath: string): Promise<TreeNode[]> => {
    try {
      const entries = await window.fs.readDir(dirPath)
      return entries.map((entry) => ({
        ...entry,
        isExpanded: false,
      }))
    } catch {
      return []
    }
  }, [])

  // Refresh the explorer tree while preserving expanded directories
  const refreshTree = useCallback(async () => {
    if (!directory) return

    const newEntries = await loadDirectory(directory)

    const reloadChildren = async (nodes: TreeNode[]): Promise<TreeNode[]> => {
      const result: TreeNode[] = []
      for (const node of nodes) {
        if (node.isDirectory && expandedPaths.has(node.path)) {
          const children = await loadDirectory(node.path)
          const loadedChildren = await reloadChildren(children)
          result.push({ ...node, children: loadedChildren })
        } else {
          result.push(node)
        }
      }
      return result
    }

    const refreshedTree = await reloadChildren(newEntries)
    setTree(refreshedTree)
  }, [directory, loadDirectory, expandedPaths])

  // Load root directory
  useEffect(() => {
    if (!directory) {
      setTree([])
      return
    }

    setIsLoading(true)
    loadDirectory(directory).then((entries) => {
      setTree(entries)
      setIsLoading(false)
    })
  }, [directory, loadDirectory])

  // Watch for file system changes
  useEffect(() => {
    if (!directory) return

    const watcherId = `explorer-${directory}`

    let refreshTimeout: ReturnType<typeof setTimeout> | null = null
    const debouncedRefresh = () => {
      if (refreshTimeout) clearTimeout(refreshTimeout)
      refreshTimeout = setTimeout(() => {
        refreshTree()
      }, 500)
    }

    window.fs.watch(watcherId, directory)
    const removeListener = window.fs.onChange(watcherId, () => {
      debouncedRefresh()
    })

    return () => {
      if (refreshTimeout) clearTimeout(refreshTimeout)
      removeListener()
      window.fs.unwatch(watcherId)
    }
  }, [directory, refreshTree])

  // Focus inline input when it appears
  useEffect(() => {
    if (inlineInput && inlineInputRef.current) {
      inlineInputRef.current.focus()
    }
  }, [inlineInput])

  // Fetch branch changes when branch view is active
  useEffect(() => {
    if (filter !== 'source-control' || scView !== 'branch' || !directory) return

    let cancelled = false
    setIsBranchLoading(true)

    window.git.branchChanges(directory).then((result) => {
      if (cancelled) return
      setBranchChanges(result.files)
      setBranchBaseName(result.baseBranch)
      setIsBranchLoading(false)
    }).catch(() => {
      if (cancelled) return
      setBranchChanges([])
      setIsBranchLoading(false)
    })

    return () => { cancelled = true }
  }, [filter, scView, directory])

  // Fetch branch commits when commits view is active
  useEffect(() => {
    if (filter !== 'source-control' || scView !== 'commits' || !directory) return

    let cancelled = false
    setIsCommitsLoading(true)

    window.git.branchCommits(directory).then((result) => {
      if (cancelled) return
      setBranchCommits(result.commits)
      setBranchBaseName(result.baseBranch)
      setIsCommitsLoading(false)
    }).catch(() => {
      if (cancelled) return
      setBranchCommits([])
      setIsCommitsLoading(false)
    })

    return () => { cancelled = true }
  }, [filter, scView, directory])

  // Fetch PR status and write access when source control is active
  useEffect(() => {
    if (filter !== 'source-control' || !directory) return

    let cancelled = false
    setIsPrLoading(true)

    const fetchPrInfo = async () => {
      try {
        const [prResult, writeAccess, headCommit] = await Promise.all([
          window.gh.prStatus(directory),
          window.gh.hasWriteAccess(directory),
          window.git.headCommit(directory),
        ])
        if (cancelled) return
        setPrStatus(prResult)
        setHasWriteAccess(writeAccess)
        setCurrentHeadCommit(headCommit)
      } catch {
        if (cancelled) return
        setPrStatus(null)
        setHasWriteAccess(false)
      }
      setIsPrLoading(false)
    }

    fetchPrInfo()

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, directory, syncStatus?.ahead, syncStatus?.behind]) // Re-fetch when commits ahead/behind change

  // Update session PR state when Explorer fetches PR status
  useEffect(() => {
    if (!onUpdatePrState) return
    if (isPrLoading) return
    if (filter !== 'source-control') return

    if (prStatus) {
      onUpdatePrState(prStatus.state, prStatus.number, prStatus.url)
    } else {
      onUpdatePrState(null)
    }
  }, [prStatus, isPrLoading, filter]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch PR comments when comments view is active
  useEffect(() => {
    if (filter !== 'source-control' || scView !== 'comments' || !directory || !prStatus) return

    let cancelled = false
    setIsCommentsLoading(true)

    const fetchComments = async () => {
      try {
        const result = await window.gh.prComments(directory, prStatus.number)
        if (cancelled) return
        setPrComments(result)
      } catch {
        if (cancelled) return
        setPrComments([])
      }
      setIsCommentsLoading(false)
    }

    fetchComments()

    return () => { cancelled = true }
  }, [filter, scView, directory, prStatus])

  // Search debounce
  useEffect(() => {
    if (filter !== 'search' || !directory) return

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    if (searchQuery.length < 2) {
      setSearchResults([])
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const results = await window.fs.search(directory, searchQuery)
        setSearchResults(results)
      } catch {
        setSearchResults([])
      }
      setIsSearching(false)
    }, 300)

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [searchQuery, directory, filter])

  // Update a node in the tree
  const updateTreeNode = (
    nodes: TreeNode[],
    path: string,
    updates: Partial<TreeNode>
  ): TreeNode[] => {
    return nodes.map((node) => {
      if (node.path === path) {
        return { ...node, ...updates }
      }
      if (node.children) {
        return { ...node, children: updateTreeNode(node.children, path, updates) }
      }
      return node
    })
  }

  // Toggle directory expansion
  const toggleExpand = async (node: TreeNode) => {
    if (!node.isDirectory) return

    const newExpanded = new Set(expandedPaths)
    if (expandedPaths.has(node.path)) {
      newExpanded.delete(node.path)
    } else {
      newExpanded.add(node.path)
      if (!node.children) {
        const children = await loadDirectory(node.path)
        setTree((prevTree) => updateTreeNode(prevTree, node.path, { children }))
      }
    }
    setExpandedPaths(newExpanded)
  }

  // Handle file click
  const handleFileClick = (node: TreeNode) => {
    if (node.isDirectory) {
      toggleExpand(node)
    } else if (onFileSelect) {
      onFileSelect(node.path, false)
    }
  }

  // Get git status for a file
  const getFileStatus = (filePath: string): GitFileStatus | undefined => {
    const relativePath = directory ? filePath.replace(directory + '/', '') : filePath
    return gitStatus.find((s) => s.path === relativePath)
  }

  // Context menu handler
  const handleContextMenu = async (e: React.MouseEvent, parentPath: string) => {
    e.preventDefault()
    e.stopPropagation()

    const result = await window.menu.popup([
      { id: 'new-file', label: 'New File' },
      { id: 'new-folder', label: 'New Folder' },
    ])

    if (result === 'new-file' || result === 'new-folder') {
      // Make sure the parent directory is expanded
      if (parentPath !== directory) {
        const newExpanded = new Set(expandedPaths)
        newExpanded.add(parentPath)
        setExpandedPaths(newExpanded)

        // Load children if needed
        const node = findNode(tree, parentPath)
        if (node && !node.children) {
          const children = await loadDirectory(parentPath)
          setTree((prevTree) => updateTreeNode(prevTree, parentPath, { children }))
        }
      }

      setInlineInput({ parentPath, type: result === 'new-file' ? 'file' : 'folder' })
      setInlineInputValue('')
    }
  }

  // Find a node in the tree
  const findNode = (nodes: TreeNode[], path: string): TreeNode | null => {
    for (const node of nodes) {
      if (node.path === path) return node
      if (node.children) {
        const found = findNode(node.children, path)
        if (found) return found
      }
    }
    return null
  }

  // Submit inline input
  const submitInlineInput = async () => {
    if (!inlineInput || !inlineInputValue.trim() || !directory) {
      setInlineInput(null)
      return
    }

    const fullPath = `${inlineInput.parentPath}/${inlineInputValue.trim()}`

    if (inlineInput.type === 'folder') {
      await window.fs.mkdir(fullPath)
    } else {
      await window.fs.createFile(fullPath)
    }

    setInlineInput(null)
    setInlineInputValue('')
    // File watcher will handle refresh
  }

  // Source control computed values
  const stagedFiles = useMemo(() => gitStatus.filter(f => f.staged), [gitStatus])
  const unstagedFiles = useMemo(() => gitStatus.filter(f => !f.staged), [gitStatus])

  // Search results as a file tree
  const searchTree = useMemo((): SearchTreeNode => {
    const root: SearchTreeNode = { name: '', path: '', children: [], results: [] }

    for (const result of searchResults) {
      const parts = result.relativePath.split('/')
      let current = root

      // Navigate/create folder nodes for all parts except the last (filename)
      for (let i = 0; i < parts.length - 1; i++) {
        const folderName = parts[i]
        let child = current.children.find(c => c.name === folderName)
        if (!child) {
          child = {
            name: folderName,
            path: parts.slice(0, i + 1).join('/'),
            children: [],
            results: [],
          }
          current.children.push(child)
        }
        current = child
      }

      current.results.push(result)
    }

    return root
  }, [searchResults])

  const handleStage = async (filePath: string) => {
    if (!directory) return
    await window.git.stage(directory, filePath)
    onGitStatusRefresh?.()
  }

  const handleStageAll = async () => {
    if (!directory) return
    await window.git.stageAll(directory)
    onGitStatusRefresh?.()
  }

  const handleUnstage = async (filePath: string) => {
    if (!directory) return
    await window.git.unstage(directory, filePath)
    onGitStatusRefresh?.()
  }

  const handleCommit = async () => {
    if (!directory || !commitMessage.trim()) return

    // If nothing staged but there are unstaged changes, offer to stage all
    if (stagedFiles.length === 0 && unstagedFiles.length > 0) {
      const action = await window.menu.popup([
        { id: 'stage-all-commit', label: `Stage All ${unstagedFiles.length} File${unstagedFiles.length !== 1 ? 's' : ''} & Commit` },
      ])
      if (action !== 'stage-all-commit') return
      await window.git.stageAll(directory)
    } else if (stagedFiles.length === 0) {
      return
    }

    setIsCommitting(true)
    setCommitError(null)
    setGitOpError(null)
    try {
      const result = await window.git.commit(directory, commitMessage.trim())
      if (result.success) {
        setCommitMessage('')
        setCommitError(null)
        onGitStatusRefresh?.()
      } else {
        const errorMsg = result.error || 'Commit failed'
        setCommitError(errorMsg)
        setCommitErrorExpanded(false)
        setGitOpError({ operation: 'Commit', message: errorMsg })
      }
    } catch (err) {
      const errorMsg = String(err)
      setCommitError(errorMsg)
      setCommitErrorExpanded(false)
      setGitOpError({ operation: 'Commit', message: errorMsg })
    } finally {
      setIsCommitting(false)
    }
  }

  const handleSync = async () => {
    if (!directory) return
    setIsSyncing(true)
    setGitOpError(null)
    try {
      const pullResult = await window.git.pull(directory)
      if (!pullResult.success) {
        setGitOpError({ operation: 'Pull', message: pullResult.error || 'Pull failed' })
        return
      }
      const pushResult = await window.git.push(directory)
      if (!pushResult.success) {
        setGitOpError({ operation: 'Push', message: pushResult.error || 'Push failed' })
        return
      }
      onGitStatusRefresh?.()
    } catch (err) {
      setGitOpError({ operation: 'Sync', message: String(err) })
    } finally {
      setIsSyncing(false)
    }
  }

  const handlePushToMain = async () => {
    if (!directory) return
    setIsPushingToMain(true)
    setGitOpError(null)
    try {
      const result = await window.gh.mergeBranchToMain(directory)
      if (result.success) {
        // Record the push with current HEAD commit
        const headCommit = await window.git.headCommit(directory)
        if (headCommit && onRecordPushToMain) {
          onRecordPushToMain(headCommit)
        }
        onGitStatusRefresh?.()
      } else {
        setGitOpError({ operation: `Push to ${branchBaseName}`, message: result.error || 'Push to main failed' })
      }
    } catch (err) {
      setGitOpError({ operation: `Push to ${branchBaseName}`, message: String(err) })
    } finally {
      setIsPushingToMain(false)
    }
  }

  const handleCreatePr = async () => {
    if (!directory) return
    const url = await window.gh.getPrCreateUrl(directory)
    if (url) {
      window.shell.openExternal(url)
    }
  }

  const handleToggleCommit = async (commitHash: string) => {
    const newExpanded = new Set(expandedCommits)
    if (newExpanded.has(commitHash)) {
      newExpanded.delete(commitHash)
    } else {
      newExpanded.add(commitHash)
      // Lazy-load files if not already loaded
      if (!commitFilesByHash[commitHash] && directory) {
        setLoadingCommitFiles(prev => new Set(prev).add(commitHash))
        try {
          const files = await window.git.commitFiles(directory, commitHash)
          setCommitFilesByHash(prev => ({ ...prev, [commitHash]: files }))
        } catch {
          setCommitFilesByHash(prev => ({ ...prev, [commitHash]: [] }))
        }
        setLoadingCommitFiles(prev => {
          const next = new Set(prev)
          next.delete(commitHash)
          return next
        })
      }
    }
    setExpandedCommits(newExpanded)
  }

  const handleReplyToComment = async (commentId: number) => {
    if (!directory || !prStatus || !replyText[commentId]?.trim()) return
    setIsSubmittingReply(commentId)
    try {
      const result = await window.gh.replyToComment(directory, prStatus.number, commentId, replyText[commentId])
      if (result.success) {
        setReplyText(prev => ({ ...prev, [commentId]: '' }))
        // Refresh comments
        const comments = await window.gh.prComments(directory, prStatus.number)
        setPrComments(comments)
      }
    } finally {
      setIsSubmittingReply(null)
    }
  }

  // Render inline input at a given depth
  const renderInlineInput = (parentPath: string, depth: number) => {
    if (!inlineInput || inlineInput.parentPath !== parentPath) return null

    return (
      <div className="flex items-center gap-1 py-0.5 px-2" style={{ paddingLeft: `${depth * 16 + 8}px` }}>
        <span className="text-text-secondary text-xs">
          {inlineInput.type === 'folder' ? '+ Folder:' : '+ File:'}
        </span>
        <input
          ref={inlineInputRef}
          type="text"
          value={inlineInputValue}
          onChange={(e) => setInlineInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              submitInlineInput()
            } else if (e.key === 'Escape') {
              setInlineInput(null)
            }
          }}
          onBlur={() => submitInlineInput()}
          className="flex-1 bg-bg-tertiary border border-border rounded px-1 py-0.5 text-xs text-text-primary outline-none focus:border-accent min-w-0"
          placeholder={inlineInput.type === 'folder' ? 'folder name' : 'filename'}
        />
      </div>
    )
  }

  // Tree keyboard navigation helper
  const navigateTreeItem = (current: HTMLElement, direction: 'up' | 'down') => {
    const container = current.closest('[data-panel-id]')
    if (!container) return
    const items = Array.from(container.querySelectorAll('[data-tree-item]')) as HTMLElement[]
    const idx = items.indexOf(current)
    const target = direction === 'down' ? items[idx + 1] : items[idx - 1]
    if (target) target.focus()
  }

  // Render a tree node
  const renderNode = (node: TreeNode, depth: number = 0): JSX.Element => {
    const nodeIsExpanded = expandedPaths.has(node.path)
    const status = getFileStatus(node.path)
    const statusColor = getStatusColor(status?.status)
    const isSelected = !node.isDirectory && node.path === selectedFilePath

    return (
      <div key={node.path}>
        <div
          data-tree-item
          tabIndex={0}
          onClick={() => handleFileClick(node)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              handleFileClick(node)
            } else if (e.key === 'ArrowDown') {
              e.preventDefault()
              navigateTreeItem(e.currentTarget as HTMLElement, 'down')
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              navigateTreeItem(e.currentTarget as HTMLElement, 'up')
            } else if (e.key === 'ArrowRight') {
              e.preventDefault()
              if (node.isDirectory) {
                if (!nodeIsExpanded) {
                  toggleExpand(node)
                } else {
                  navigateTreeItem(e.currentTarget as HTMLElement, 'down')
                }
              }
            } else if (e.key === 'ArrowLeft') {
              e.preventDefault()
              if (node.isDirectory && nodeIsExpanded) {
                toggleExpand(node)
              } else {
                // Move to parent — find the closest ancestor tree item
                const container = (e.currentTarget as HTMLElement).closest('[data-panel-id]')
                if (container) {
                  const items = Array.from(container.querySelectorAll('[data-tree-item]')) as HTMLElement[]
                  const idx = items.indexOf(e.currentTarget as HTMLElement)
                  // Walk backwards to find parent (item with less indentation)
                  for (let i = idx - 1; i >= 0; i--) {
                    const itemDepth = parseInt(items[i].style.paddingLeft || '0')
                    const currentDepth = parseInt((e.currentTarget as HTMLElement).style.paddingLeft || '0')
                    if (itemDepth < currentDepth) {
                      items[i].focus()
                      break
                    }
                  }
                }
              }
            } else if (e.key === 'Home') {
              e.preventDefault()
              const container = (e.currentTarget as HTMLElement).closest('[data-panel-id]')
              const first = container?.querySelector('[data-tree-item]') as HTMLElement
              if (first) first.focus()
            } else if (e.key === 'End') {
              e.preventDefault()
              const container = (e.currentTarget as HTMLElement).closest('[data-panel-id]')
              const items = container?.querySelectorAll('[data-tree-item]')
              if (items && items.length > 0) (items[items.length - 1] as HTMLElement).focus()
            }
          }}
          onContextMenu={node.isDirectory ? (e) => handleContextMenu(e, node.path) : undefined}
          className={`flex items-center gap-2 py-1 px-2 rounded cursor-pointer outline-none focus:bg-accent/15 ${statusColor} ${
            isSelected ? 'bg-accent/20 ring-1 ring-accent/50' : 'hover:bg-bg-tertiary'
          }`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          title={status ? `${node.name} — ${statusLabel(status.status)}` : node.name}
        >
          {node.isDirectory ? (
            <span className="text-text-secondary w-4 text-center">
              {nodeIsExpanded ? '▼' : '▶'}
            </span>
          ) : (
            <span className="w-4" />
          )}
          <span className="truncate">{node.name}</span>
          {status && (
            <span className="ml-auto">
              <StatusBadge status={status.status} />
            </span>
          )}
        </div>
        {node.isDirectory && nodeIsExpanded && (
          <div>
            {renderInlineInput(node.path, depth + 1)}
            {node.children && node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  // Check if there are changes since last push to main
  const hasChangesSincePush = useMemo(() => {
    if (!pushedToMainCommit || !currentHeadCommit) return true
    return pushedToMainCommit !== currentHeadCommit
  }, [pushedToMainCommit, currentHeadCommit])

  // Clear pushed status if there are new changes
  useEffect(() => {
    if (pushedToMainAt && hasChangesSincePush && onClearPushToMain) {
      onClearPushToMain()
    }
  }, [pushedToMainAt, hasChangesSincePush, onClearPushToMain])

  // Render source control tab
  const renderSourceControl = () => {
    if (!directory) return null

    // View toggle (Working / Branch / Comments)
    const viewToggle = (
      <div className="px-3 py-1.5 border-b border-border flex items-center gap-1">
        <button
          onClick={() => setScView('working')}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            scView === 'working' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
          }`}
        >
          Uncommitted
        </button>
        <button
          onClick={() => setScView('branch')}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            scView === 'branch' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
          }`}
        >
          Branch
        </button>
        <button
          onClick={() => setScView('commits')}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            scView === 'commits' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
          }`}
        >
          Commits
        </button>
        {prStatus && (
          <button
            onClick={() => setScView('comments')}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              scView === 'comments' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
            }`}
          >
            Comments
          </button>
        )}
      </div>
    )

    // PR Status banner
    const prStatusBanner = (
      <div className="px-3 py-2 border-b border-border bg-bg-secondary">
        {isPrLoading ? (
          <div className="text-xs text-text-secondary">Loading PR status...</div>
        ) : prStatus ? (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${prStateBadgeClass(prStatus.state)}`}>
                {prStatus.state}
              </span>
              <button
                onClick={() => window.shell.openExternal(prStatus!.url)}
                className="text-xs text-accent hover:underline truncate flex-1 text-left"
              >
                #{prStatus.number}: {prStatus.title}
              </button>
            </div>
          </div>
        ) : branchStatus === 'merged' ? (
          <div className="flex items-center gap-2">
            <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-purple-500/20 text-purple-400">
              MERGED
            </span>
            <span className="text-xs text-text-secondary">
              Branch merged to {branchBaseName}
            </span>
          </div>
        ) : syncStatus?.current && syncStatus.current !== branchBaseName ? (
          <div className="flex flex-col gap-2">
            <div className="text-xs text-text-secondary">
              No PR for this branch
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCreatePr}
                className="px-2 py-1 text-xs rounded bg-accent text-white hover:bg-accent/80"
              >
                Create PR
              </button>
              {(hasWriteAccess || currentRepo?.allowPushToMain) && (
                <button
                  onClick={handlePushToMain}
                  disabled={isPushingToMain}
                  className="px-2 py-1 text-xs rounded bg-bg-tertiary text-text-primary hover:bg-bg-secondary disabled:opacity-50"
                >
                  {isPushingToMain ? 'Pushing...' : `Push to ${branchBaseName}`}
                </button>
              )}
            </div>
          </div>
        ) : null}
      </div>
    )

    // Git operation error banner
    const gitOpErrorBanner = gitOpError ? (
      <div className="px-3 py-2 border-b border-red-500/30 bg-red-500/10 flex items-center gap-2">
        <div
          className="flex-1 text-xs text-red-400 cursor-pointer hover:text-red-300 truncate"
          title="Click to view full error"
          onClick={async () => {
            const errorContent = `${gitOpError.operation} failed\n${'='.repeat(40)}\n\n${gitOpError.message}`
            const errorPath = '/tmp/broomy-git-error.txt'
            await window.fs.writeFile(errorPath, errorContent)
            onFileSelect?.(errorPath, false)
          }}
        >
          {gitOpError.operation} failed: {gitOpError.message.length > 80
            ? gitOpError.message.slice(0, 80) + '...'
            : gitOpError.message}
        </div>
        <button
          onClick={() => setGitOpError(null)}
          className="text-red-400 hover:text-red-300 text-xs shrink-0 px-1"
          title="Dismiss"
        >
          &times;
        </button>
      </div>
    ) : null

    // Comments view
    if (scView === 'comments') {
      return (
        <div className="flex flex-col h-full">
          {viewToggle}
          {prStatusBanner}
          {gitOpErrorBanner}
          {isCommentsLoading ? (
            <div className="flex-1 flex items-center justify-center text-text-secondary text-xs">Loading comments...</div>
          ) : prComments.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-text-secondary text-xs">
              No review comments
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto text-sm">
              {prComments.filter(c => !c.inReplyToId).map((comment) => {
                const replies = prComments.filter(c => c.inReplyToId === comment.id)
                return (
                  <div key={comment.id} className="border-b border-border">
                    <div
                      className="px-3 py-2 hover:bg-bg-tertiary cursor-pointer"
                      onClick={() => {
                        if (onFileSelect && directory && comment.path) {
                          onFileSelect(`${directory}/${comment.path}`, true, comment.line ?? undefined)
                        }
                      }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-text-primary">{comment.author}</span>
                        <span className="text-xs text-text-secondary">
                          {new Date(comment.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="text-xs text-accent mb-1">
                        {comment.path}{comment.line ? `:${comment.line}` : ''}
                      </div>
                      <div className="text-xs text-text-primary whitespace-pre-wrap">
                        {comment.body}
                      </div>
                    </div>
                    {/* Replies */}
                    {replies.map(reply => (
                      <div key={reply.id} className="px-3 py-2 pl-6 bg-bg-secondary/50">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-text-primary">{reply.author}</span>
                          <span className="text-xs text-text-secondary">
                            {new Date(reply.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="text-xs text-text-primary whitespace-pre-wrap">
                          {reply.body}
                        </div>
                      </div>
                    ))}
                    {/* Reply input */}
                    <div className="px-3 py-2 pl-6 bg-bg-tertiary/30">
                      <textarea
                        value={replyText[comment.id] || ''}
                        onChange={(e) => setReplyText(prev => ({ ...prev, [comment.id]: e.target.value }))}
                        placeholder="Write a reply..."
                        className="w-full bg-bg-tertiary border border-border rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-accent resize-none"
                        rows={2}
                      />
                      <button
                        onClick={() => handleReplyToComment(comment.id)}
                        disabled={isSubmittingReply === comment.id || !replyText[comment.id]?.trim()}
                        className="mt-1 px-2 py-1 text-xs rounded bg-accent text-white hover:bg-accent/80 disabled:opacity-50"
                      >
                        {isSubmittingReply === comment.id ? 'Sending...' : 'Reply'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )
    }

    // Commits view
    if (scView === 'commits') {
      return (
        <div className="flex flex-col h-full">
          {viewToggle}
          {prStatusBanner}
          {gitOpErrorBanner}
          {isCommitsLoading ? (
            <div className="flex-1 flex items-center justify-center text-text-secondary text-xs">Loading...</div>
          ) : branchCommits.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-text-secondary text-xs">
              No commits ahead of {branchBaseName}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto text-sm">
              <div className="px-3 py-1.5 text-xs font-medium text-text-secondary uppercase tracking-wide bg-bg-secondary">
                Commits ({branchCommits.length})
              </div>
              {branchCommits.map((commit) => {
                const isExpanded = expandedCommits.has(commit.hash)
                const files = commitFilesByHash[commit.hash]
                const isLoadingFiles = loadingCommitFiles.has(commit.hash)
                return (
                  <div key={commit.hash}>
                    <div
                      className="flex items-center gap-2 px-3 py-1.5 hover:bg-bg-tertiary cursor-pointer"
                      onClick={() => handleToggleCommit(commit.hash)}
                      title={`${commit.shortHash} — ${commit.message}\nby ${commit.author} on ${new Date(commit.date).toLocaleDateString()}`}
                    >
                      <span className="text-text-secondary w-3 text-center text-xs">
                        {isExpanded ? '▼' : '▶'}
                      </span>
                      <span className="text-xs font-mono text-accent shrink-0">{commit.shortHash}</span>
                      <span className="text-xs text-text-primary truncate flex-1">{commit.message}</span>
                    </div>
                    {isExpanded && (
                      <div className="bg-bg-secondary/30">
                        {isLoadingFiles ? (
                          <div className="px-3 py-1 pl-8 text-xs text-text-secondary">Loading files...</div>
                        ) : files && files.length > 0 ? (
                          files.map((file) => (
                            <div
                              key={`${commit.hash}-${file.path}`}
                              className="flex items-center gap-2 px-3 py-1 pl-8 hover:bg-bg-tertiary cursor-pointer"
                              title={`${file.path} — ${statusLabel(file.status)}`}
                              onClick={() => {
                                if (onFileSelect && directory) {
                                  onFileSelect(
                                    `${directory}/${file.path}`,
                                    true,
                                    undefined,
                                    undefined,
                                    `${commit.hash}~1`,
                                    commit.hash,
                                    `${commit.shortHash}: ${commit.message}`
                                  )
                                }
                              }}
                            >
                              <span className={`truncate flex-1 text-xs ${getStatusColor(file.status)}`}>
                                {file.path}
                              </span>
                              <StatusBadge status={file.status} />
                            </div>
                          ))
                        ) : (
                          <div className="px-3 py-1 pl-8 text-xs text-text-secondary">No files changed</div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )
    }

    // Branch changes view
    if (scView === 'branch') {
      return (
        <div className="flex flex-col h-full">
          {viewToggle}
          {prStatusBanner}
          {gitOpErrorBanner}
          {isBranchLoading ? (
            <div className="flex-1 flex items-center justify-center text-text-secondary text-xs">Loading...</div>
          ) : branchChanges.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-text-secondary text-xs">
              No changes vs {branchBaseName}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto text-sm">
              <div className="px-3 py-1.5 text-xs font-medium text-text-secondary uppercase tracking-wide bg-bg-secondary">
                Changes vs {branchBaseName} ({branchChanges.length})
              </div>
              {branchChanges.map((file) => (
                <div
                  key={`branch-${file.path}`}
                  className="flex items-center gap-2 px-3 py-1 hover:bg-bg-tertiary cursor-pointer"
                  title={`${file.path} — ${statusLabel(file.status)}`}
                  onClick={() => {
                    if (onFileSelect && directory) {
                      onFileSelect(`${directory}/${file.path}`, true, undefined, undefined, `origin/${branchBaseName}`, undefined, `Branch vs ${branchBaseName}`)
                    }
                  }}
                >
                  <span className={`truncate flex-1 text-xs ${getStatusColor(file.status)}`}>
                    {file.path}
                  </span>
                  <StatusBadge status={file.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      )
    }

    // Working changes view
    const hasChanges = gitStatus.length > 0

    if (!hasChanges) {
      const ahead = syncStatus?.ahead ?? 0
      const behind = syncStatus?.behind ?? 0
      const hasRemoteChanges = ahead > 0 || behind > 0

      // No changes: show sync view
      return (
        <div className="flex flex-col h-full">
          {viewToggle}
          {prStatusBanner}
          {gitOpErrorBanner}
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-4">
            {syncStatus?.tracking && (
              <div className="text-xs text-text-secondary text-center">
                {syncStatus.current} &rarr; {syncStatus.tracking}
              </div>
            )}

            {hasRemoteChanges ? (
              <div className="flex flex-col items-center gap-2">
                {ahead > 0 && (
                  <div className="flex items-center gap-2 text-sm text-green-400">
                    <span className="text-lg">&uarr;</span>
                    <span className="font-medium">{ahead} commit{ahead !== 1 ? 's' : ''} to push</span>
                  </div>
                )}
                {behind > 0 && (
                  <div className="flex items-center gap-2 text-sm text-blue-400">
                    <span className="text-lg">&darr;</span>
                    <span className="font-medium">{behind} commit{behind !== 1 ? 's' : ''} to pull</span>
                  </div>
                )}
              </div>
            ) : branchStatus && branchStatus !== 'in-progress' ? (
              <BranchStatusCard status={branchStatus} />
            ) : (
              <div className="text-sm text-text-secondary">Up to date</div>
            )}

            {syncStatus?.tracking && branchStatus !== 'merged' && (
              <button
                onClick={handleSync}
                disabled={isSyncing}
                className={`px-4 py-1.5 text-xs rounded text-white disabled:opacity-50 ${
                  hasRemoteChanges
                    ? 'bg-accent hover:bg-accent/80'
                    : 'bg-bg-tertiary text-text-secondary hover:bg-bg-secondary'
                }`}
              >
                {isSyncing ? 'Syncing...' : 'Sync Changes'}
              </button>
            )}
          </div>
        </div>
      )
    }

    // Has changes: show commit view
    return (
      <div className="flex flex-col h-full">
        {viewToggle}
        {prStatusBanner}
        {gitOpErrorBanner}
        {/* Commit area */}
        <div className="px-3 py-2 border-b border-border">
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCommit()
              }}
              placeholder="Commit message"
              className="flex-1 bg-bg-tertiary border border-border rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-accent min-w-0"
            />
            <button
              onClick={handleCommit}
              disabled={isCommitting || gitStatus.length === 0 || !commitMessage.trim()}
              className="px-2 py-1 text-xs rounded bg-accent text-white hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              {isCommitting ? 'Committing...' : 'Commit'}
            </button>
            <button
              onClick={async () => {
                const action = await window.menu.popup([
                  { id: 'stage-all', label: 'Stage All Changes' },
                ])
                if (action === 'stage-all') handleStageAll()
              }}
              disabled={unstagedFiles.length === 0}
              className="px-1 py-1 text-xs rounded text-text-secondary hover:text-text-primary hover:bg-bg-tertiary disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              title="More actions"
            >
              &#x22EF;
            </button>
          </div>
          {commitError && (
            <div className="mt-1 flex items-start gap-1 bg-red-500/10 border border-red-500/30 rounded px-2 py-1">
              <div
                className="flex-1 text-xs text-red-400 cursor-pointer"
                onClick={() => setCommitErrorExpanded(!commitErrorExpanded)}
              >
                {commitErrorExpanded ? commitError : (commitError.length > 80 ? commitError.slice(0, 80) + '...' : commitError)}
              </div>
              <button
                onClick={() => setCommitError(null)}
                className="text-red-400 hover:text-red-300 text-xs shrink-0 px-1"
                title="Dismiss"
              >
                x
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto text-sm">
          {/* Staged Changes */}
          <div className="px-3 py-1.5 text-xs font-medium text-text-secondary uppercase tracking-wide bg-bg-secondary">
            Staged Changes ({stagedFiles.length})
          </div>
          {stagedFiles.length === 0 ? (
            <div className="px-3 py-2 text-xs text-text-secondary">No staged changes</div>
          ) : (
            stagedFiles.map((file) => (
              <div
                key={`staged-${file.path}`}
                className="flex items-center gap-2 px-3 py-1 hover:bg-bg-tertiary cursor-pointer group"
                title={`${file.path} — ${statusLabel(file.status)} (staged)`}
                onClick={() => {
                  if (onFileSelect && directory) {
                    onFileSelect(`${directory}/${file.path}`, true)
                  }
                }}
              >
                <span className={`truncate flex-1 text-xs ${getStatusColor(file.status)}`}>
                  {file.path}
                </span>
                <StatusBadge status={file.status} />
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleUnstage(file.path)
                  }}
                  className="opacity-0 group-hover:opacity-100 text-text-secondary hover:text-text-primary text-xs px-1"
                  title="Unstage"
                >
                  -
                </button>
              </div>
            ))
          )}

          {/* Changes */}
          <div
            className="px-3 py-1.5 text-xs font-medium text-text-secondary uppercase tracking-wide bg-bg-secondary mt-1 cursor-default"
            onContextMenu={async (e) => {
              e.preventDefault()
              if (unstagedFiles.length === 0) return
              const action = await window.menu.popup([
                { id: 'stage-all', label: 'Stage All Changes' },
              ])
              if (action === 'stage-all') handleStageAll()
            }}
          >
            Changes ({unstagedFiles.length})
          </div>
          {unstagedFiles.length === 0 ? (
            <div className="px-3 py-2 text-xs text-text-secondary">No changes</div>
          ) : (
            unstagedFiles.map((file) => (
              <div
                key={`unstaged-${file.path}`}
                className="flex items-center gap-2 px-3 py-1 hover:bg-bg-tertiary cursor-pointer group"
                title={`${file.path} — ${statusLabel(file.status)}`}
                onClick={() => {
                  if (onFileSelect && directory) {
                    onFileSelect(`${directory}/${file.path}`, true)
                  }
                }}
              >
                <span className={`truncate flex-1 text-xs ${getStatusColor(file.status)}`}>
                  {file.path}
                </span>
                <StatusBadge status={file.status} />
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleStage(file.path)
                  }}
                  className="opacity-0 group-hover:opacity-100 text-text-secondary hover:text-text-primary text-xs px-1"
                  title="Stage"
                >
                  +
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    )
  }

  // Render search tab
  const renderSearch = () => {
    const toggleGroup = (folder: string) => {
      setCollapsedSearchGroups(prev => {
        const next = new Set(prev)
        if (next.has(folder)) {
          next.delete(folder)
        } else {
          next.add(folder)
        }
        return next
      })
    }

    const renderSearchTreeNode = (node: SearchTreeNode, depth: number): JSX.Element | null => {
      const isCollapsed = collapsedSearchGroups.has(node.path)
      const isRoot = node.path === ''

      return (
        <div key={node.path || 'search-root'}>
          {!isRoot && (
            <div
              className="py-1 text-xs text-text-secondary cursor-pointer hover:bg-bg-tertiary flex items-center gap-1"
              style={{ paddingLeft: `${depth * 16 + 8}px` }}
              onClick={() => toggleGroup(node.path)}
            >
              <span className="w-3 text-center">{isCollapsed ? '▶' : '▼'}</span>
              <span className="truncate">{node.name}</span>
            </div>
          )}
          {(isRoot || !isCollapsed) && (
            <>
              {node.children.map(child => renderSearchTreeNode(child, isRoot ? depth : depth + 1))}
              {node.results.map((result) => (
                <div key={result.path}>
                  <div
                    className="py-1 hover:bg-bg-tertiary cursor-pointer flex items-center gap-2"
                    style={{ paddingLeft: `${(isRoot ? depth : depth + 1) * 16 + 8}px` }}
                    onClick={() => onFileSelect?.(result.path, false)}
                  >
                    <span className="w-3" />
                    <span className="text-xs truncate text-text-primary">{result.name}</span>
                    <span className="text-xs text-text-secondary opacity-60 ml-auto shrink-0 pr-2">
                      {result.matchType === 'filename' ? 'name' : 'content'}
                    </span>
                  </div>
                  {result.contentMatches.map((match, i) => (
                    <div
                      key={`${result.path}-${match.line}-${i}`}
                      className="py-0.5 hover:bg-bg-tertiary cursor-pointer text-xs text-text-secondary truncate"
                      style={{ paddingLeft: `${(isRoot ? depth : depth + 1) * 16 + 28}px` }}
                      onClick={() => onFileSelect?.(result.path, false, match.line, searchQuery)}
                      title={`${match.line}: ${match.text}`}
                    >
                      <span className="text-text-secondary opacity-60 mr-2">{match.line}:</span>
                      <span className="text-text-primary">{match.text}</span>
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}
        </div>
      )
    }

    return (
      <div className="flex flex-col h-full">
        <div className="px-3 py-2 border-b border-border">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search files..."
            className="w-full bg-bg-tertiary border border-border rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-accent"
          />
        </div>
        <div className="flex-1 overflow-y-auto text-sm">
          {isSearching && (
            <div className="px-3 py-4 text-xs text-text-secondary text-center">Searching...</div>
          )}
          {!isSearching && searchQuery.length >= 2 && searchResults.length === 0 && (
            <div className="px-3 py-4 text-xs text-text-secondary text-center">No results found</div>
          )}
          {!isSearching && searchQuery.length < 2 && searchQuery.length > 0 && (
            <div className="px-3 py-4 text-xs text-text-secondary text-center">Type at least 2 characters</div>
          )}
          {!isSearching && searchResults.length > 0 && renderSearchTreeNode(searchTree, 0)}
        </div>
      </div>
    )
  }

  // Render recent files tab
  const renderRecent = () => {
    if (recentFiles.length === 0) {
      return (
        <div className="flex-1 flex items-center justify-center text-text-secondary text-xs">
          No recently opened files
        </div>
      )
    }

    return (
      <div className="flex-1 overflow-y-auto text-sm">
        {recentFiles.map((filePath) => {
          const name = filePath.split('/').pop() || filePath
          const relativePath = directory ? filePath.replace(directory + '/', '') : filePath
          const isSelected = filePath === selectedFilePath

          return (
            <div
              key={filePath}
              data-tree-item
              tabIndex={0}
              onClick={() => onFileSelect?.(filePath, false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  onFileSelect?.(filePath, false)
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  navigateTreeItem(e.currentTarget as HTMLElement, 'down')
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  navigateTreeItem(e.currentTarget as HTMLElement, 'up')
                }
              }}
              className={`flex items-center gap-2 px-3 py-1 cursor-pointer outline-none focus:bg-accent/15 ${
                isSelected ? 'bg-accent/20' : 'hover:bg-bg-tertiary'
              }`}
              title={relativePath}
            >
              <span className="w-4" />
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-xs text-text-primary truncate">{name}</span>
                <span className="text-[10px] text-text-secondary truncate">{relativePath}</span>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  if (!directory) {
    return (
      <div className="h-full flex items-center justify-center text-text-secondary text-sm">
        Select a session to view files
      </div>
    )
  }

  if (isLoading && filter === 'files') {
    return (
      <div className="h-full flex items-center justify-center text-text-secondary text-sm">
        Loading...
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Tab bar */}
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <span className="text-sm font-medium text-text-primary">Explorer</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onFilterChange('files')}
            className={`p-1 rounded transition-colors ${
              filter === 'files'
                ? 'bg-accent text-white'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
            }`}
            title="Files"
          >
            <FileTreeIcon />
          </button>
          <button
            onClick={() => onFilterChange('source-control')}
            className={`p-1 rounded transition-colors ${
              filter === 'source-control'
                ? 'bg-accent text-white'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
            }`}
            title="Source Control"
          >
            <SourceControlIcon />
          </button>
          <button
            onClick={() => onFilterChange('search')}
            className={`p-1 rounded transition-colors ${
              filter === 'search'
                ? 'bg-accent text-white'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
            }`}
            title="Search"
          >
            <SearchIcon />
          </button>
          <button
            onClick={() => onFilterChange('recent')}
            className={`p-1 rounded transition-colors ${
              filter === 'recent'
                ? 'bg-accent text-white'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
            }`}
            title="Recent Files"
          >
            <RecentIcon />
          </button>
        </div>
      </div>

      {/* Plan chip - shown at top when plan file is detected */}
      {planFilePath && (
        <div className="px-3 py-1.5 border-b border-border">
          <button
            onClick={() => onFileSelect?.(planFilePath, false)}
            className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors ${
              selectedFilePath === planFilePath
                ? 'bg-accent text-white'
                : 'bg-bg-tertiary text-text-secondary hover:text-text-primary hover:bg-accent/20'
            }`}
            title={planFilePath}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
              <path d="M9 14l2 2 4-4" />
            </svg>
            Plan
          </button>
        </div>
      )}

      {/* Tab content */}
      {filter === 'files' && (
        <div className="flex-1 overflow-y-auto p-2 text-sm">
          <div
            className="text-text-secondary mb-2 px-2 truncate text-xs cursor-context-menu"
            onContextMenu={(e) => handleContextMenu(e, directory)}
          >
            {directory}
          </div>
          {renderInlineInput(directory, 0)}
          {tree.length === 0 ? (
            <div className="text-center text-text-secondary text-sm py-4">
              Empty directory
            </div>
          ) : (
            tree.map((node) => renderNode(node))
          )}
        </div>
      )}

      {filter === 'source-control' && renderSourceControl()}
      {filter === 'search' && renderSearch()}
      {filter === 'recent' && renderRecent()}
    </div>
  )
}
