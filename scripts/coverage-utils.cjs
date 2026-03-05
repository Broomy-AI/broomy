#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')

const CACHE_PATH = path.join(__dirname, '..', '.broomy', 'output', 'coverage-summary.json')

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeJSON(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n')
}

function calcAggregate(summary) {
  let totalStatements = 0
  let coveredStatements = 0
  let totalLines = 0
  let coveredLines = 0
  let totalBranches = 0
  let coveredBranches = 0
  let totalFunctions = 0
  let coveredFunctions = 0

  for (const [key, entry] of Object.entries(summary)) {
    if (key === 'total') continue
    totalStatements += entry.statements.total
    coveredStatements += entry.statements.covered
    totalLines += entry.lines.total
    coveredLines += entry.lines.covered
    totalBranches += entry.branches.total
    coveredBranches += entry.branches.covered
    totalFunctions += entry.functions.total
    coveredFunctions += entry.functions.covered
  }

  return {
    statements: {
      total: totalStatements,
      covered: coveredStatements,
      pct: totalStatements === 0 ? 100 : +(coveredStatements / totalStatements * 100).toFixed(2),
    },
    lines: {
      total: totalLines,
      covered: coveredLines,
      pct: totalLines === 0 ? 100 : +(coveredLines / totalLines * 100).toFixed(2),
    },
    branches: {
      total: totalBranches,
      covered: coveredBranches,
      pct: totalBranches === 0 ? 100 : +(coveredBranches / totalBranches * 100).toFixed(2),
    },
    functions: {
      total: totalFunctions,
      covered: coveredFunctions,
      pct: totalFunctions === 0 ? 100 : +(coveredFunctions / totalFunctions * 100).toFixed(2),
    },
  }
}

function lookup(file) {
  if (!fs.existsSync(CACHE_PATH)) {
    console.error('No cached coverage summary found at', CACHE_PATH)
    console.error('Run /coverage-run first to generate it.')
    process.exit(1)
  }

  const summary = readJSON(CACHE_PATH)
  const total = summary.total

  if (!file) {
    console.log('=== Overall Coverage ===')
    console.log('Lines:      ' + total.lines.pct + '% (' + total.lines.covered + '/' + total.lines.total + ')')
    console.log('Statements: ' + total.statements.pct + '%')
    console.log('Branches:   ' + total.branches.pct + '%')
    console.log('Functions:  ' + total.functions.pct + '%')
    return
  }

  // Find the file — try exact match first, then suffix match
  let matchKey = null
  for (const key of Object.keys(summary)) {
    if (key === 'total') continue
    if (key === file || key.endsWith('/' + file)) {
      matchKey = key
      break
    }
  }

  if (!matchKey) {
    console.error('File not found in coverage summary: ' + file)
    console.error('Available files:')
    for (const key of Object.keys(summary)) {
      if (key !== 'total') console.error('  ' + key)
    }
    process.exit(1)
  }

  const entry = summary[matchKey]
  console.log('=== Coverage for ' + matchKey + ' ===')
  console.log('Lines:      ' + entry.lines.pct + '% (' + entry.lines.covered + '/' + entry.lines.total + ')')
  console.log('Statements: ' + entry.statements.pct + '%')
  console.log('Branches:   ' + entry.branches.pct + '%')
  console.log('Functions:  ' + entry.functions.pct + '%')
  console.log('')
  console.log('=== Overall ===')
  console.log('Lines: ' + total.lines.pct + '%')
}

function update(file, newSummaryPath) {
  if (!fs.existsSync(CACHE_PATH)) {
    console.error('No cached coverage summary found at', CACHE_PATH)
    console.error('Run /coverage-run first to generate it.')
    process.exit(1)
  }

  if (!fs.existsSync(newSummaryPath)) {
    console.error('New coverage summary not found at', newSummaryPath)
    process.exit(1)
  }

  const cached = readJSON(CACHE_PATH)
  const fresh = readJSON(newSummaryPath)

  // Find the file key in both summaries
  let cachedKey = null
  for (const key of Object.keys(cached)) {
    if (key === 'total') continue
    if (key === file || key.endsWith('/' + file)) {
      cachedKey = key
      break
    }
  }

  let freshKey = null
  for (const key of Object.keys(fresh)) {
    if (key === 'total') continue
    if (key === file || key.endsWith('/' + file)) {
      freshKey = key
      break
    }
  }

  if (!freshKey) {
    console.error('File not found in new coverage summary: ' + file)
    process.exit(1)
  }

  const keyToUse = cachedKey || freshKey

  // Replace the file entry
  cached[keyToUse] = fresh[freshKey]

  // Recalculate aggregate
  cached.total = calcAggregate(cached)

  writeJSON(CACHE_PATH, cached)

  const entry = cached[keyToUse]
  console.log('=== Updated coverage for ' + keyToUse + ' ===')
  console.log('Lines:      ' + entry.lines.pct + '% (' + entry.lines.covered + '/' + entry.lines.total + ')')
  console.log('Statements: ' + entry.statements.pct + '%')
  console.log('Branches:   ' + entry.branches.pct + '%')
  console.log('Functions:  ' + entry.functions.pct + '%')
  console.log('')
  console.log('=== New Overall ===')
  console.log('Lines: ' + cached.total.lines.pct + '%')
}

function belowThreshold(thresholdPct) {
  if (!fs.existsSync(CACHE_PATH)) {
    console.error('No cached coverage summary found at', CACHE_PATH)
    console.error('Run /coverage-run first to generate it.')
    process.exit(1)
  }

  const summary = readJSON(CACHE_PATH)
  const results = []

  for (const [key, entry] of Object.entries(summary)) {
    if (key === 'total') continue
    if (entry.lines.pct < thresholdPct) {
      results.push({ file: key, pct: entry.lines.pct, covered: entry.lines.covered, total: entry.lines.total })
    }
  }

  results.sort((a, b) => a.pct - b.pct)

  if (results.length === 0) {
    console.log('All files are at or above ' + thresholdPct + '% line coverage.')
  } else {
    console.log('Files below ' + thresholdPct + '% line coverage (worst first):')
    for (const r of results) {
      console.log('  ' + r.pct + '% ' + r.file + ' (' + r.covered + '/' + r.total + ' lines)')
    }
  }
}

// CLI
const [,, command, ...args] = process.argv

switch (command) {
  case 'lookup':
    lookup(args[0])
    break
  case 'update':
    if (args.length < 2) {
      console.error('Usage: coverage-utils.cjs update <file> <new-summary-path>')
      process.exit(1)
    }
    update(args[0], args[1])
    break
  case 'below':
    belowThreshold(Number(args[0]) || 90)
    break
  default:
    console.error('Usage: coverage-utils.cjs <lookup|update|below> [args...]')
    console.error('')
    console.error('Commands:')
    console.error('  lookup [file]              Show coverage for a file or overall summary')
    console.error('  update <file> <summary>    Merge new coverage data for a file into cache')
    console.error('  below [threshold]          List files below threshold (default 90%)')
    process.exit(1)
}
