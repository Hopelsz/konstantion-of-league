/**
 * ┌───────────────────────────────────────────────────────────────────────────────┐
 * │ This module is used to create the api the renderer process utilizes and is    │
 * │ exposed via the preload process.                                              │
 * └───────────────────────────────────────────────────────────────────────────────┘
 */

import { ipcMain, BrowserWindow, app } from 'electron'

import { askAndSetLeaguePath, isCurrentLeaguePathValid, askAndSelectLocalSkins, getCurrentSkinId, getChampionSkinId, getCloseBehavior, setCloseBehavior, getFloatWindowEnabled, setFloatWindowEnabled, getMultiChampionSkinEnabled, setMultiChampionSkinEnabled, getFloatWindowPosition, setFloatWindowPosition, getLeaguePath, getConfigValue, type FloatWindowPosition } from './config'
import { useLocalLolSkins, checkLolSkinsExist, getExistingSkins, invalidateExistingSkinsCache, getSkinsLocation } from './download'
import { setSkin, disableSkin, clearAllSkins, getChampionSkinsDetail } from './skins'
import { type Skin, type Chroma, listSkins, listChampions, invalidateMetadataCache } from './metadata'
import { invalidateChampionMap } from './lcu'

/** 配置向导所需的当前配置快照 */
export interface ConfigPaths {
  leaguePath: string
  /** 用户自定义皮肤目录（空 = 使用默认位置 skinsLocation） */
  skinsPath: string
  /** 皮肤目录当前是否真实可用（skinsAvailable 且磁盘含皮肤文件） */
  skinsAvailable: boolean
  /** 当前实际使用的皮肤目录（自定义或默认） */
  skinsLocation: string
  /** leaguePath 是否为有效的英雄联盟安装目录 */
  leaguePathValid: boolean
}

ipcMain.handle('getConfigPaths', async (): Promise<ConfigPaths> => {
  const [leaguePath, skinsPathVal, skinsLocation, leaguePathValid, skinsOk] = await Promise.all([
    getLeaguePath(),
    getConfigValue('skinsPath'),
    getSkinsLocation(),
    isCurrentLeaguePathValid(),
    checkLolSkinsExist(),
  ])
  return {
    leaguePath,
    skinsPath: typeof skinsPathVal === 'string' ? skinsPathVal : '',
    skinsAvailable: skinsOk,
    skinsLocation,
    leaguePathValid,
  }
})

// 渲染进程（悬浮窗设置面板）请求打开配置向导窗口
ipcMain.on('open-setup-window', () => {
  void import('./index').then(({ openSetupWindow }) => openSetupWindow())
})

ipcMain.handle('isCurrentLeaguePathValid', isCurrentLeaguePathValid)
ipcMain.handle('askAndSetLeaguePath', askAndSetLeaguePath)
ipcMain.handle('askAndSelectLocalSkins', askAndSelectLocalSkins)
ipcMain.handle('useLocalLolSkins', async (_, localPath: string) => {
  await useLocalLolSkins(localPath)
  invalidateMetadataCache()
  invalidateExistingSkinsCache()
  invalidateChampionMap()
})
ipcMain.handle('checkLolSkinsExist', checkLolSkinsExist)
ipcMain.handle('listSkins', listSkins)
ipcMain.handle('getExistingSkins', getExistingSkins)
ipcMain.handle('listChampions', listChampions)
ipcMain.handle('setSkin', async (_, skin: Skin | Chroma) => {
  await setSkin(skin)
  // 广播皮肤状态变更到所有窗口
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send('skin-state-changed', skin.championId, `${skin.championId}-${skin.id}`)
  })
})
ipcMain.handle('disableSkin', async (_, championId?: number) => {
  await disableSkin(championId)
  // 广播皮肤状态变更到所有窗口
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send('skin-state-changed', championId ?? 0, null)
  })
})
ipcMain.handle('clearAllSkins', () => clearAllSkins())
ipcMain.handle('getChampionSkinsDetail', () => getChampionSkinsDetail())
ipcMain.handle('getCurrentSkinId', getCurrentSkinId)
ipcMain.handle('getChampionSkinId', (_, championId: number) => getChampionSkinId(championId))
ipcMain.handle('getCloseBehavior', getCloseBehavior)
ipcMain.handle('setCloseBehavior', (_, behavior) => setCloseBehavior(behavior))
ipcMain.handle('getFloatWindowEnabled', getFloatWindowEnabled)
ipcMain.handle('setFloatWindowEnabled', (_, enabled: boolean) => setFloatWindowEnabled(enabled))
ipcMain.handle('getFloatWindowPosition', getFloatWindowPosition)
ipcMain.handle('setFloatWindowPosition', async (_, position: FloatWindowPosition) => {
  await setFloatWindowPosition(position)
  // 悬浮窗正在显示时立即按新位置重定位；动态 import 避免与 index.ts 循环依赖
  const { refreshFloatWindowPosition } = await import('./index')
  refreshFloatWindowPosition()
})
ipcMain.handle('getMultiChampionSkinEnabled', getMultiChampionSkinEnabled)
ipcMain.handle('setMultiChampionSkinEnabled', (_, enabled: boolean) => setMultiChampionSkinEnabled(enabled))
ipcMain.handle('getAppVersion', () => app.getVersion())
