/**
 * Shared utility functions for file viewer plugins.
 *
 * Centralises file-extension → language and file-extension → MIME-type
 * mappings so that MonacoViewer, MonacoDiffViewer, ImageViewer, and
 * ImageDiffViewer all share a single source of truth.
 */
import { getFileExtension } from './types'

// ── Monaco language mapping ─────────────────────────────────────────

const LANGUAGE_MAP: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  md: 'markdown',
  markdown: 'markdown',
  css: 'css',
  scss: 'scss',
  sass: 'scss',
  less: 'less',
  html: 'html',
  htm: 'html',
  xml: 'xml',
  xsl: 'xml',
  xslt: 'xml',
  svg: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  scala: 'scala',
  c: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  h: 'c',
  hpp: 'cpp',
  hxx: 'cpp',
  cs: 'csharp',
  fs: 'fsharp',
  fsx: 'fsharp',
  php: 'php',
  pl: 'perl',
  pm: 'perl',
  lua: 'lua',
  r: 'r',
  swift: 'swift',
  dart: 'dart',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  fish: 'shell',
  ps1: 'powershell',
  bat: 'bat',
  cmd: 'bat',
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  cmake: 'cmake',
  toml: 'ini',
  ini: 'ini',
  cfg: 'ini',
  env: 'ini',
  properties: 'ini',
  txt: 'plaintext',
  log: 'plaintext',
}

/** Map a file path to its Monaco language ID. */
export function getLanguageFromPath(filePath: string): string {
  const ext = getFileExtension(filePath)
  return LANGUAGE_MAP[ext] || 'plaintext'
}

// ── Image MIME-type mapping ─────────────────────────────────────────

export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg']

const MIME_MAP: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  svg: 'image/svg+xml',
}

/** Map a file path to its image MIME type. */
export function getMimeType(filePath: string): string {
  const ext = getFileExtension(filePath)
  return MIME_MAP[ext] || 'image/png'
}

/** Check if a file path refers to a known image format. */
export function isImageFile(filePath: string): boolean {
  const ext = getFileExtension(filePath)
  return IMAGE_EXTENSIONS.includes(ext)
}
