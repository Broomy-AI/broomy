import { describe, it, expect } from 'vitest'
import { formatElapsedTime } from './formatTime'

describe('formatElapsedTime', () => {
  it('shows seconds only below 60', () => {
    expect(formatElapsedTime(0)).toBe('0s')
    expect(formatElapsedTime(1)).toBe('1s')
    expect(formatElapsedTime(59)).toBe('59s')
  })

  it('transitions to minutes at exactly 60 seconds', () => {
    expect(formatElapsedTime(60)).toBe('1m 00s')
  })

  it('pads seconds with a leading zero in the minutes format', () => {
    expect(formatElapsedTime(61)).toBe('1m 01s')
    expect(formatElapsedTime(90)).toBe('1m 30s')
    expect(formatElapsedTime(605)).toBe('10m 05s')
  })

  it('shows up to 59 minutes in the m/s format', () => {
    expect(formatElapsedTime(3599)).toBe('59m 59s')
  })

  it('transitions to hours at exactly 3600 seconds', () => {
    expect(formatElapsedTime(3600)).toBe('1h 00m')
  })

  it('pads minutes with a leading zero in the hours format', () => {
    expect(formatElapsedTime(3660)).toBe('1h 01m')
    expect(formatElapsedTime(7200)).toBe('2h 00m')
    expect(formatElapsedTime(7384)).toBe('2h 03m')
  })
})
