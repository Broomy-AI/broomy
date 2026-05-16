/**
 * Regression test that replays every .cast fixture through @xterm/headless
 * and compares the resulting buffer dump against a checked-in snapshot.
 *
 * To accept a new snapshot (when you've added a fixture or the expected
 * output has changed), set the env var BROOMY_UPDATE_TERMINAL_SNAPSHOTS=1.
 * Re-running the test then overwrites the snapshot files; commit them.
 *
 * Fixtures live in ./fixtures/*.cast. Snapshots live in ./snapshots/*.snap.
 * The mapping is by basename: foo.cast -> foo.snap.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs'
import { join, dirname, basename } from 'path'
import { fileURLToPath } from 'url'
import { replayCastText, formatReplayResult } from './replay'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = join(HERE, 'fixtures')
const SNAPSHOTS_DIR = join(HERE, 'snapshots')
const UPDATE = process.env.BROOMY_UPDATE_TERMINAL_SNAPSHOTS === '1'

function listFixtures(): string[] {
  if (!existsSync(FIXTURES_DIR)) return []
  return readdirSync(FIXTURES_DIR)
    .filter(f => f.endsWith('.cast'))
    .sort()
}

describe('terminal replay harness', () => {
  const fixtures = listFixtures()

  if (fixtures.length === 0) {
    it('has no fixtures yet (placeholder)', () => {
      expect(fixtures).toEqual([])
    })
    return
  }

  for (const fixture of fixtures) {
    it(`replays ${fixture} matching its snapshot`, async () => {
      const castPath = join(FIXTURES_DIR, fixture)
      const castText = readFileSync(castPath, 'utf8')
      const result = await replayCastText(castText)
      const actual = formatReplayResult(result)

      const snapPath = join(SNAPSHOTS_DIR, `${basename(fixture, '.cast')}.snap`)
      if (UPDATE || !existsSync(snapPath)) {
        writeFileSync(snapPath, actual)
        return
      }
      const expected = readFileSync(snapPath, 'utf8')
      expect(actual).toBe(expected)
    })
  }
})
