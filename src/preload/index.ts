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
  updateSkinsMetadata: (): Promise<number> => ipcRenderer.invoke('updateSkinsMetadata'),
  getSkinsMetadataState: (): Promise<{ upToDate: boolean; latestPatch: string | null; metadataPatch: string | null }> =>
    ipcRenderer.invoke('getSkinsMetadataState'),
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
  getFloatWindowEnabled: (): Promise<boolean> => ipcRenderer.invoke('getFloatWindowEnabled'),
  setFloatWindowEnabled: (enabled: boolean): Promise<void> => ipcRenderer.invoke('setFloatWindowEnabled', enabled),
  getFloatWindowPosition: (): Promise<FloatWindowPosition> => ipcRenderer.invoke('getFloatWindowPosition'),
  getFloatWindowAlwaysOnTop: (): Promise<boolean> => ipcRenderer.invoke('getFloatWindowAlwaysOnTop'),
  setFloatWindowAlwaysOnTop: (enabled: boolean): Promise<void> =>
    ipcRenderer.invoke('setFloatWindowAlwaysOnTop', enabled),
  setFloatWindowPosition: (position: FloatWindowPosition): Promise<void> => ipcRenderer.invoke('setFloatWindowPosition', position),
  getMultiChampionSkinEnabled: (): Promise<boolean> => ipcRenderer.invoke('getMultiChampionSkinEnabled'),
  setMultiChampionSkinEnabled: (enabled: boolean): Promise<void> => ipcRenderer.invoke('setMultiChampionSkinEnabled', enabled),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('getAppVersion'),
  // Window controls
  minimizeWindow: (): void => ipcRenderer.send('window-minimize'),
  closeWindow: (): void => ipcRenderer.send('window-close'),
  hideWindow: (): void => ipcRenderer.send('window-hide'),
  quitApp: (): void => ipcRenderer.send('app-quit'),
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
  // 主进程后台自动更新完皮肤元数据（配置窗口据此刷新提示）
  onMetadataUpdated: (callback: () => void): (() => void) => {
    const handler = () => callback()
    ipcRenderer.on('metadata-updated', handler)
    return () => ipcRenderer.removeListener('metadata-updated', handler)
  },
  onSkinStateChanged: (callback: (championId: number, skinId: string | null) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, championId: number, skinId: string | null) => callback(championId, skinId)
    ipcRenderer.on('skin-state-changed', handler)
    return () => ipcRenderer.removeListener('skin-state-changed', handler)
  }
}

contextBridge.exposeInMainWorld('api', api)

// 导出 api 类型供 .d.ts 使用
export type api = typeof api
