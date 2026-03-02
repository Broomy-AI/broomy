/**
 * Type definitions for the agent analyses feature.
 */

/** Definition of an available analysis type */
export interface AnalysisDefinition {
  id: string
  label: string
  description: string
  promptTemplate: string
  outputFile: string
}

/** Result written by agent to .broomy/analyses/<id>.json */
export interface AnalysisResult {
  version: 1
  analysisId: string
  generatedAt: string
  summary: string
  findings: AnalysisFinding[]
}

export interface AnalysisFinding {
  severity: 'info' | 'warning' | 'critical'
  title: string
  description: string
  file?: string
  line?: number
}
