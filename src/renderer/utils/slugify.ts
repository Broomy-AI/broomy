import { COMMON_WORDS, COMMON_WORDS_SET } from './commonWords'

/**
 * Converts a GitHub issue into a git branch name.
 *
 * Strips common English words to produce concise, meaningful branch names.
 * Keeps uncommon words from the title; if fewer than 3 remain, backfills
 * with the rarest common words (from the end of the frequency list) to
 * reach a minimum of 3 words. Word order from the original title is preserved.
 */
export function issueToBranchName(issue: { number: number; title: string }): string {
  const words = issue.title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0)

  if (words.length === 0) return `issue-${issue.number}`

  const uncommon: string[] = []
  const common: { word: string; index: number; freqIndex: number }[] = []

  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    if (COMMON_WORDS_SET.has(word)) {
      const freqIndex = COMMON_WORDS.indexOf(word)
      common.push({ word, index: i, freqIndex })
    } else {
      uncommon.push(word)
    }
  }

  if (uncommon.length >= 3) {
    return uncommon.join('-')
  }

  // Need to backfill with common words (rarest first = highest freqIndex first)
  const sortedCommon = [...common].sort((a, b) => b.freqIndex - a.freqIndex)
  const backfillWords = new Set(uncommon)
  const backfillIndices = new Map<string, number>()

  // Track original indices for uncommon words
  for (let i = 0; i < words.length; i++) {
    if (backfillWords.has(words[i]) && !backfillIndices.has(words[i])) {
      backfillIndices.set(words[i], i)
    }
  }

  for (const entry of sortedCommon) {
    if (backfillWords.size >= 3) break
    if (!backfillWords.has(entry.word)) {
      backfillWords.add(entry.word)
      backfillIndices.set(entry.word, entry.index)
    }
  }

  // Reconstruct in original word order
  const result = words.filter((w) => backfillWords.has(w))
  // Deduplicate consecutive
  const deduped: string[] = []
  for (const w of result) {
    if (deduped[deduped.length - 1] !== w || !backfillWords.has(w)) {
      deduped.push(w)
    }
  }

  return deduped.join('-') || `issue-${issue.number}`
}
