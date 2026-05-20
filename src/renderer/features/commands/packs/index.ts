import type { ActionDefinition } from '../commandsConfig'
import basics from './basics.json'
import superpowers from './superpowers.json'
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
export const PACKS: Pack[] = [superpowers as Pack, gstack as Pack, basics as Pack]

export function getPack(id: string): Pack | undefined {
  return PACKS.find(p => p.id === id)
}
