/**
 * Fetches the list of Claude models supported by the SDK, with a fallback list.
 * The result is module-level cached so the IPC call only happens once per app session.
 */
import { useState, useEffect } from 'react'
import type { SdkModelInfo } from '../../../preload/apis/types'

export const FALLBACK_MODELS: SdkModelInfo[] = [
  { value: 'default', displayName: 'Default (Opus 4.6)', description: 'Most capable', supportsEffort: true, supportedEffortLevels: ['low', 'medium', 'high', 'max'] },
  { value: 'sonnet', displayName: 'Sonnet 4.6', description: 'Best for everyday tasks', supportsEffort: true, supportedEffortLevels: ['low', 'medium', 'high'] },
  { value: 'haiku', displayName: 'Haiku 4.5', description: 'Fastest', supportsEffort: false },
]

export const DEFAULT_MODEL = 'default'

/** Extract the model name from the SDK description, e.g. "Opus 4.6 with 1M context · ..." → "Opus 4.6" */
function extractModelName(description: string): string | null {
  const beforeDot = description.split(' · ')[0]
  const beforeWith = beforeDot.split(' with ')[0]
  return beforeWith.trim() || null
}

function applyDisplayNames(models: SdkModelInfo[]): SdkModelInfo[] {
  return models.map(m => {
    const modelName = extractModelName(m.description)
    if (!modelName) return m
    const isDefault = m.value === 'default'
    return { ...m, displayName: isDefault ? `${modelName} (default)` : modelName }
  })
}

let cachedModels: SdkModelInfo[] | null = null
let fetchPromise: Promise<SdkModelInfo[]> | null = null

export function useSdkModels(): { models: SdkModelInfo[]; loading: boolean } {
  const [models, setModels] = useState<SdkModelInfo[]>(cachedModels ?? FALLBACK_MODELS)
  const [loading, setLoading] = useState(cachedModels === null)

  useEffect(() => {
    if (cachedModels !== null) return
    if (!fetchPromise) {
      fetchPromise = window.agentSdk.models().then((result) => {
        const list = applyDisplayNames(result.length > 0 ? result : FALLBACK_MODELS)
        cachedModels = list
        return list
      }).catch(() => {
        cachedModels = FALLBACK_MODELS
        return FALLBACK_MODELS
      })
    }
    fetchPromise.then((list) => {
      setModels(list)
      setLoading(false)
    }).catch(() => {
      setModels(FALLBACK_MODELS)
      setLoading(false)
    })
  }, [])

  return { models, loading }
}
