/**
 * Built-in analysis definitions with default prompt templates.
 */
import type { AnalysisDefinition } from '../../../types/analysis'

export const BUILTIN_ANALYSES: AnalysisDefinition[] = [
  {
    id: 'security',
    label: 'Security Review',
    description: 'Checks for common security vulnerabilities and unsafe patterns.',
    promptTemplate: `Analyze the changes on this branch for security issues. Look for:
- Command injection, XSS, SQL injection
- Hardcoded secrets or credentials
- Insecure use of crypto or random
- Path traversal vulnerabilities
- Unsafe deserialization
- Missing input validation at system boundaries

Write your findings to .broomy/analyses/security.json in this format:
{
  "version": 1,
  "analysisId": "security",
  "generatedAt": "<ISO timestamp>",
  "summary": "<one paragraph summary>",
  "findings": [
    {
      "severity": "info" | "warning" | "critical",
      "title": "<short title>",
      "description": "<description>",
      "file": "<relative path>",
      "line": <line number or null>
    }
  ]
}

If there are no findings, write the file with an empty findings array.`,
    outputFile: '.broomy/analyses/security.json',
  },
  {
    id: 'accessibility',
    label: 'Accessibility Review',
    description: 'Checks for accessibility issues in UI components.',
    promptTemplate: `Analyze the UI changes on this branch for accessibility issues. Look for:
- Missing ARIA labels and roles
- Missing alt text on images
- Poor color contrast
- Missing keyboard navigation
- Missing focus management
- Missing screen reader support

Write your findings to .broomy/analyses/accessibility.json in this format:
{
  "version": 1,
  "analysisId": "accessibility",
  "generatedAt": "<ISO timestamp>",
  "summary": "<one paragraph summary>",
  "findings": [
    {
      "severity": "info" | "warning" | "critical",
      "title": "<short title>",
      "description": "<description>",
      "file": "<relative path>",
      "line": <line number or null>
    }
  ]
}

If there are no findings, write the file with an empty findings array.`,
    outputFile: '.broomy/analyses/accessibility.json',
  },
]
