import { describe, it, expect } from 'vitest'
import { isTextContent } from './textDetection'

describe('isTextContent', () => {
  it('returns true for empty string', () => {
    expect(isTextContent('')).toBe(true)
  })

  it('returns true for normal text', () => {
    expect(isTextContent('Hello, world!')).toBe(true)
  })

  it('returns true for code content', () => {
    const code = 'function foo() {\n  return 42;\n}\n'
    expect(isTextContent(code)).toBe(true)
  })

  it('returns true for text with tabs and newlines', () => {
    expect(isTextContent('line1\tvalue1\nline2\tvalue2\r\n')).toBe(true)
  })

  it('returns false for content with null bytes (binary)', () => {
    expect(isTextContent('some\0binary\0content')).toBe(false)
  })

  it('returns false for mostly non-printable characters', () => {
    // Create a string where >15% is non-printable
    const nonPrintable = String.fromCharCode(1).repeat(20)
    const printable = 'abc'
    expect(isTextContent(nonPrintable + printable)).toBe(false)
  })

  it('returns true for text with some extended ASCII chars', () => {
    // Extended ASCII (160-255) should be considered printable
    const text = 'caf\u00e9 na\u00efve r\u00e9sum\u00e9'
    expect(isTextContent(text)).toBe(true)
  })

  it('returns true when printable ratio is above 85%', () => {
    // 90 printable + 10 non-printable = 90% printable
    const printable = 'A'.repeat(90)
    const nonPrintable = String.fromCharCode(1).repeat(10)
    expect(isTextContent(printable + nonPrintable)).toBe(true)
  })

  it('returns false when printable ratio is below 85%', () => {
    // 80 printable + 20 non-printable = 80% printable
    const printable = 'A'.repeat(80)
    const nonPrintable = String.fromCharCode(1).repeat(20)
    expect(isTextContent(printable + nonPrintable)).toBe(false)
  })

  it('treats carriage return as printable', () => {
    expect(isTextContent('line1\r\nline2\r\n')).toBe(true)
  })

  it('returns true for JSON content', () => {
    const json = '{"key": "value", "number": 42, "array": [1, 2, 3]}'
    expect(isTextContent(json)).toBe(true)
  })
})
