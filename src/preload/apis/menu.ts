import { ipcRenderer } from 'electron'
import type { MenuItemDef, TsProjectContext } from './types'

export type MenuApi = {
  popup: (items: MenuItemDef[]) => Promise<string | null>
}

export type TsApi = {
  getProjectContext: (projectRoot: string) => Promise<TsProjectContext>
}

export const menuApi: MenuApi = {
  popup: (items) => ipcRenderer.invoke('menu:popup', items),
}

export const tsApi: TsApi = {
  getProjectContext: (projectRoot) => ipcRenderer.invoke('ts:getProjectContext', projectRoot),
}
