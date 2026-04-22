#!/usr/bin/env node
/**
 * Real SDK integration test — NOT for CI, burns real tokens.
 * Tests that the SDK can authenticate, run a simple query, and handle slash commands.
 *
 * Usage: node tests/agent-sdk-real.mjs
 */
import { query } from '../node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs'
import { homedir } from 'os'
import { join } from 'path'

const CLAUDE_CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')

console.log('=== Agent SDK Real Integration Test ===')
console.log('HOME:', process.env.HOME)
console.log('CLAUDE_CONFIG_DIR:', CLAUDE_CONFIG_DIR)
console.log()

let passed = 0
let failed = 0

async function test(name, fn) {
  process.stdout.write(`TEST: ${name} ... `)
  try {
    await fn()
    console.log('PASS')
    passed++
  } catch (e) {
    console.log('FAIL:', e.message)
    failed++
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg)
}

// ---- Test 1: Basic query with auth ----
await test('Basic query authenticates and returns a result', async () => {
  const messages = []
  let initMsg = null

  const q = query({
    prompt: 'Say "hello" and nothing else.',
    options: {
      env: { ...process.env, CLAUDE_CONFIG_DIR },
      tools: { type: 'preset', preset: 'claude_code' },
      systemPrompt: { type: 'preset', preset: 'claude_code' },
      settingSources: ['user'],
      maxTurns: 1,
      cwd: process.cwd(),
    },
  })

  for await (const msg of q) {
    messages.push(msg)
    if (msg.type === 'system' && msg.subtype === 'init') {
      initMsg = msg
    }
  }

  assert(initMsg, 'Should receive a system init message')
  assert(initMsg.session_id, 'Init message should have session_id')
  console.log(`  session_id=${initMsg.session_id}, model=${initMsg.model}`)

  const resultMsg = messages.find(m => m.type === 'result')
  assert(resultMsg, 'Should receive a result message')
  assert(resultMsg.subtype === 'success', `Result should be success, got: ${resultMsg.subtype}`)
  console.log(`  result="${(resultMsg.result || '').slice(0, 80)}"`)
})

// ---- Test 2: Session resume ----
await test('Session resume works', async () => {
  // First query: capture session ID
  let sessionId = null
  const q1 = query({
    prompt: 'Remember the word "banana". Just say OK.',
    options: {
      env: { ...process.env, CLAUDE_CONFIG_DIR },
      settingSources: ['user'],
      maxTurns: 1,
      cwd: process.cwd(),
    },
  })
  for await (const msg of q1) {
    if (msg.type === 'system' && msg.subtype === 'init') {
      sessionId = msg.session_id
    }
  }
  assert(sessionId, 'Should get session_id from first query')
  console.log(`  session_id=${sessionId}`)

  // Second query: resume
  let resultText = ''
  const q2 = query({
    prompt: 'What word did I ask you to remember? Just say the word.',
    options: {
      env: { ...process.env, CLAUDE_CONFIG_DIR },
      settingSources: ['user'],
      resume: sessionId,
      maxTurns: 1,
      cwd: process.cwd(),
    },
  })
  for await (const msg of q2) {
    if (msg.type === 'result' && msg.result) {
      resultText = msg.result.toLowerCase()
    }
  }
  console.log(`  resumed result="${resultText.slice(0, 80)}"`)
  assert(resultText.includes('banana'), `Resume should recall "banana", got: "${resultText}"`)
})

// ---- Test 3: /cost slash command ----
await test('/cost slash command works', async () => {
  const messages = []
  const q = query({
    prompt: '/cost',
    options: {
      env: { ...process.env, CLAUDE_CONFIG_DIR },
      settingSources: ['user'],
      maxTurns: 0,
      cwd: process.cwd(),
    },
  })
  for await (const msg of q) {
    messages.push(msg)
  }
  const result = messages.find(m => m.type === 'result')
  assert(result, 'Should get a result from /cost')
  assert(result.subtype === 'success', `Should succeed, got: ${result.subtype}`)
  console.log(`  /cost result="${(result.result || '').slice(0, 80)}"`)
})

// ---- Test 4: Multi-turn via resume (not streamInput) ----
await test('Multi-turn via sequential query() with resume', async () => {
  // First turn
  let sessionId = null
  const q1 = query({
    prompt: 'Say "first" and nothing else.',
    options: {
      env: { ...process.env, CLAUDE_CONFIG_DIR },
      settingSources: ['user'],
      maxTurns: 1,
      cwd: process.cwd(),
    },
  })
  let firstResult = ''
  for await (const msg of q1) {
    if (msg.type === 'system' && msg.subtype === 'init') sessionId = msg.session_id
    if (msg.type === 'result') firstResult = msg.result || ''
  }
  console.log(`  first="${firstResult.slice(0, 40)}", session=${sessionId}`)
  assert(sessionId, 'Should have session ID')

  // Second turn: resume same session
  const q2 = query({
    prompt: 'Now say "second" and nothing else.',
    options: {
      env: { ...process.env, CLAUDE_CONFIG_DIR },
      settingSources: ['user'],
      resume: sessionId,
      maxTurns: 1,
      cwd: process.cwd(),
    },
  })
  let secondResult = ''
  for await (const msg of q2) {
    if (msg.type === 'result') secondResult = msg.result || ''
  }
  console.log(`  second="${secondResult.slice(0, 40)}"`)
  assert(secondResult.toLowerCase().includes('second'), `Should say "second", got: "${secondResult}"`)
})

// ---- Test 5: /login command ----
await test('/login slash command (check if SDK supports it)', async () => {
  const messages = []
  const q = query({
    prompt: '/login',
    options: {
      env: { ...process.env, CLAUDE_CONFIG_DIR },
      settingSources: ['user'],
      maxTurns: 0,
      cwd: process.cwd(),
    },
  })
  for await (const msg of q) {
    messages.push(msg)
  }
  const result = messages.find(m => m.type === 'result')
  console.log(`  /login subtype=${result?.subtype}, result="${(result?.result || '').slice(0, 80)}"`)
  // Just log — don't assert, we want to see what happens
})

console.log()
console.log(`=== Results: ${passed} passed, ${failed} failed ===`)
process.exit(failed > 0 ? 1 : 0)
