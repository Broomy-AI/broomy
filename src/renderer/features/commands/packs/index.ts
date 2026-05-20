import type { ActionDefinition } from '../commandsConfig'
import basics from './basics.json'
import gstack from './gstack.json'

export interface Pack {
  id: string
  name: string
  description: string
  version: number
  actions: ActionDefinition[]
  requiresPlugin?: { name: string; url: string }
}

// Order matters: the first pack gets the "Recommended" badge in the picker.
// Basics is a guided AI workflow that triggers Superpowers skills naturally when
// the user has that plugin installed — Superpowers itself doesn't have user-facing
// slash commands, so there's no Superpowers pack to ship.
export const PACKS: Pack[] = [basics as Pack, gstack as Pack]

export function getPack(id: string): Pack | undefined {
  return PACKS.find(p => p.id === id)
}
