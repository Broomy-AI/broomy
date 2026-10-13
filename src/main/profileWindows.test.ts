import { describe, expect, it } from 'vitest'
import type { BrowserWindow } from 'electron'
import { removeProfileWindow, setWindowProfile } from './profileWindows'

function windowStub(): BrowserWindow {
  return { isDestroyed: () => false } as BrowserWindow
}

describe('profile window ownership', () => {
  it('removes the current association after repeated switches without removing a replacement window', () => {
    const windows = new Map<string, BrowserWindow>()
    const first = windowStub()
    const second = windowStub()
    setWindowProfile(windows, first, 'a')
    setWindowProfile(windows, first, 'b')
    setWindowProfile(windows, first, 'c')
    setWindowProfile(windows, second, 'a')
    removeProfileWindow(windows, first)
    expect([...windows]).toEqual([['a', second]])
  })

  it('retains another window for a shared profile when the current representative closes', () => {
    const windows = new Map<string, BrowserWindow>()
    const first = windowStub()
    const second = windowStub()
    setWindowProfile(windows, first, 'a')
    setWindowProfile(windows, second, 'b')
    setWindowProfile(windows, first, 'b')
    expect(windows.get('b')).toBe(first)
    removeProfileWindow(windows, first)
    expect(windows.get('b')).toBe(second)
    removeProfileWindow(windows, second)
    expect(windows.size).toBe(0)
  })
})
