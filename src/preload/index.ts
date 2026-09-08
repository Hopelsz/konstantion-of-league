import { contextBridge, ipcRenderer } from 'electron'

import { Champion, Skin, Chroma } from '../main/metadata'
import { type FloatWindowPosition } from '../main/config'
import { type ConfigPaths } from '../main/api'

const api = {
  // 配置向导
  getConfigPaths: (): Promise<ConfigPaths> => ipcRenderer.invoke('getConfigPaths'),
  openSetupWindow: (): void => ipcRenderer.send('open-setup-window'),
  isCurrentLeaguePathValid: (): Promise<boolean> => ipcRenderer.invoke('isCurrentLeaguePathValid'),
  askAndSetLeaguePath: (): Promise<boolean | null> => ipcRenderer.invoke('askAndSetLeaguePath'),
  askAndSelectLocalSkins: (): Promise<string | null> =>
    ipcRenderer.invoke('askAndSelectLocalSkins'),
  useLocalLolSkins: (localPath: string): Promise<void> =>
    ipcRenderer.invoke('useLocalLolSkins', localPath),
  checkLolSkinsExist: (): Promise<boolean> => ipcRenderer.invoke('checkLolSkinsExist'),
  listSkins: (): Promise<Skin[]> => ipcRenderer.invoke('listSkins'),
  getExistingSkins: (): Promise<Skin[]> => ipcRenderer.invoke('getExistingSkins'),
  listChampions: (): Promise<Champion[]> => ipcRenderer.invoke('listChampions'),
  setSkin: (skin: Skin | Chroma): Promise<void> => ipcRenderer.invoke('setSkin', skin),
  disableSkin: (championId?: number): Promise<void> => ipcRenderer.invoke('disableSkin', championId),
  clearAllSkins: (): Promise<void> =>
    ipcRenderer.invoke('clearAllSkins'),
  getChampionSkinsDetail: (): Promise<
    Array<{ championId: number; championName: string; skinId: string; skinName: string }>
  > => ipcRenderer.invoke('getChampionSkinsDetail'),
  getCurrentSkinId: (): Promise<string | null> => ipcRenderer.invoke('getCurrentSkinId'),
  getChampionSkinId: (championId: number): Promise<string | null> =>
    ipcRenderer.invoke('getChampionSkinId', championId),
  getCloseBehavior: (): Promise<string> => ipcRenderer.invoke('getCloseBehavior'),
  setCloseBehavior: (behavior: string): Promise<void> => ipcRenderer.invoke('setCloseBehavior', behavior),
  getFloatWindowEnabled: (): Promise<boolean> => ipcRenderer.invoke('getFloatWindowEnabled'),
  setFloatWindowEnabled: (enabled: boolean): Promise<void> => ipcRenderer.invoke('setFloatWindowEnabled', enabled),
  getFloatWindowPosition: (): Promise<FloatWindowPosition> => ipcRenderer.invoke('getFloatWindowPosition'),
  setFloatWindowPosition: (position: FloatWindowPosition): Promise<void> => ipcRenderer.invoke('setFloatWindowPosition', position),
  getMultiChampionSkinEnabled: (): Promise<boolean> => ipcRenderer.invoke('getMultiChampionSkinEnabled'),
  setMultiChampionSkinEnabled: (enabled: boolean): Promise<void> => ipcRenderer.invoke('setMultiChampionSkinEnabled', enabled),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('getAppVersion'),
  // Window controls
  minimizeWindow: (): void => ipcRenderer.send('window-minimize'),
  maximizeWindow: (): void => ipcRenderer.send('window-maximize'),
  closeWindow: (): void => ipcRenderer.send('window-close'),
  hideWindow: (): void => ipcRenderer.send('window-hide'),
  quitApp: (): void => ipcRenderer.send('app-quit'),
  isWindowMaximized: (): Promise<boolean> => ipcRenderer.invoke('window-is-maximized'),
  onWindowMaximized: (callback: (maximized: boolean) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, maximized: boolean) => callback(maximized)
    ipcRenderer.on('window-maximized', handler)
    return () => ipcRenderer.removeListener('window-maximized', handler)
  },
  // 浮动窗口
  showFloatWindow: (champion: Champion): void => ipcRenderer.send('show-float-window', champion),
  hideFloatWindow: (): void => ipcRenderer.send('hide-float-window'),
  onFloatChampionData: (callback: (champion: Champion) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, champion: Champion) => callback(champion)
    ipcRenderer.on('float-champion-data', handler)
    return () => ipcRenderer.removeListener('float-champion-data', handler)
  },
  onFloatWindowPositionChanged: (callback: (position: FloatWindowPosition) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, position: FloatWindowPosition) => callback(position)
    ipcRenderer.on('float-window-position-changed', handler)
    return () => ipcRenderer.removeListener('float-window-position-changed', handler)
  },
  // 皮肤状态同步
  onSkinStateChanged: (callback: (championId: number, skinId: string | null) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, championId: number, skinId: string | null) => callback(championId, skinId)
    ipcRenderer.on('skin-state-changed', handler)
    return () => ipcRenderer.removeListener('skin-state-changed', handler)
  },
  // LCU 通信事件
  onLcuChampionSelected: (callback: (champion: Champion) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, champion: Champion) => callback(champion)
    ipcRenderer.on('lcu-champion-selected', handler)
    return () => ipcRenderer.removeListener('lcu-champion-selected', handler)
  },
  onLcuChampSelectEnded: (callback: () => void): (() => void) => {
    const handler = () => callback()
    ipcRenderer.on('lcu-champ-select-ended', handler)
    return () => ipcRenderer.removeListener('lcu-champ-select-ended', handler)
  }
}

contextBridge.exposeInMainWorld('api', api)

// 导出 api 类型供 .d.ts 使用
export type api = typeof api
