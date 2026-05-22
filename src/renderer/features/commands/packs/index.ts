import type { ActionDefinition } from '../commandsConfig'
import basics from './basics.json'

export interface Pack {
  id: string
  name: string
  description: string
  version: number
  actions: ActionDefinition[]
  requiresPlugin?: { name: string; url: string }
}

// Basics is the only starter pack today. More are planned — the setup picker
// shows a "more coming" placeholder so users know this list will grow.
export const PACKS: Pack[] = [basics as Pack]

export function getPack(id: string): Pack | undefined {
  return PACKS.find(p => p.id === id)
}
