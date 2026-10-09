/**
 * ┌──────────────────────────────────────────────────────────────────────────────┐
 * │ This module manages the configuration file used by other modules.            │
 * └──────────────────────────────────────────────────────────────────────────────┘
 */

import { dialog } from 'electron'
import path from 'path'
import fs from 'fs-extra'

import { CONFIG_PATH } from './constants'

const DEFAULT_CONFIG = {
  leaguePath: '',
  skinsPath: '',
  /** 本地皮肤是否可用：仅导入成功或下载完成时为 true（B 方案：选错路径即清空皮肤列表） */
  skinsAvailable: false,
  currentSkinId: null as string | null,
  championSkins: {} as Record<string, string>
}

/** 内存缓存：避免每次读取配置都访问磁盘 */
let configCache: Record<string, unknown> | null = null

/**
 * Read the config file safely, returning parsed object or default.
 * 使用内存缓存，避免启动时多个 IPC 调用重复读取磁盘。
 */
async function readConfig(): Promise<Record<string, unknown>> {
  if (configCache) return { ...configCache }

  try {
    const exists = await fs.pathExists(CONFIG_PATH)
    if (!exists) {
      await fs.writeFile(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2))
      configCache = { ...DEFAULT_CONFIG }
      return { ...DEFAULT_CONFIG }
    }
    const raw = await fs.readFile(CONFIG_PATH, 'utf-8')
    if (!raw.trim()) {
      await fs.writeFile(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2))
      configCache = { ...DEFAULT_CONFIG }
      return { ...DEFAULT_CONFIG }
    }
    const parsed = JSON.parse(raw)
    configCache = parsed
    return parsed
  } catch {
    // If file is corrupted, reset to defaults
    await fs.writeFile(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2))
    configCache = { ...DEFAULT_CONFIG }
    return { ...DEFAULT_CONFIG }
  }
}

/**
 * This function gets a value from the config file.
 * @param key the key to get the value of.
 * @returns {Promise<string | boolean | null>} the value of the key.
 */
export async function getConfigValue(key: string): Promise<string | boolean | null> {
  const config = await readConfig()
  const val = config[key]
  if (typeof val === 'string' || typeof val === 'boolean') return val
  return null
}

/**
 * This function sets a value in the config file.
 * @param key the key to set the value of.
 * @param value the value to set.
 */
export async function setConfigValue(key: string, value: string | boolean): Promise<void> {
  const config = await readConfig()
  config[key] = value
  // 同步更新缓存
  configCache = config
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2))
}

/**
 * This function checks if the league path is valid.
 * @param leaguePath the league path to check.
 * @returns {Promise<boolean>} true if the league path is valid, false otherwise.
 */
export async function isLeaguePathValid(leaguePath: string): Promise<boolean> {
  if (!leaguePath) return false

  const normalizedPath = leaguePath.toLowerCase()
  const isExeFile = normalizedPath.endsWith('.exe')
  const isGameDir = normalizedPath.endsWith('Game') || normalizedPath.endsWith('game\\')
  let checkPath = leaguePath
  if (isExeFile) {
    checkPath = path.dirname(leaguePath)
  }

  if (isGameDir || checkPath.toLowerCase().endsWith('game')) {
    const lolPath = path.join(checkPath, 'League of Legends.exe')
    const lcPath = path.join(checkPath, 'LeagueClient.exe')
    const lolExists = await fs.pathExists(lolPath)
    const lcExists = await fs.pathExists(lcPath)
    return lolExists || lcExists
  }

  const gameLolPath = path.join(checkPath, 'Game', 'League of Legends.exe')
  const gameLcPath = path.join(checkPath, 'Game', 'LeagueClient.exe')
  const rootLcPath = path.join(checkPath, 'LeagueClient.exe')
  const gameLolExists = await fs.pathExists(gameLolPath)
  const gameLcExists = await fs.pathExists(gameLcPath)
  const rootLcExists = await fs.pathExists(rootLcPath)
  const gameDirExists = await fs.pathExists(path.join(checkPath, 'Game'))
  return gameLolExists || gameLcExists || (rootLcExists && gameDirExists)
}

/**
 * This function sets the league path in the config file.
 * @param leaguePath the league path to set.
 * @returns {Promise<boolean>} true if the league path was set, false otherwise.
 */
export async function setLeaguePath(leaguePath: string): Promise<boolean> {
  if (!(await isLeaguePathValid(leaguePath))) {
    // 选错也记录用户实际选的路径，便于排错时确认是否配错
    await setConfigValue('leaguePath', leaguePath)
    return false
  }
  const finalPath = await normalizeLeaguePath(leaguePath)
  await setConfigValue('leaguePath', finalPath)
  return true
}

export async function askAndSetLeaguePath(): Promise<boolean | null> {
  const { BrowserWindow } = await import('electron')
  const mainWindow = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]

  let result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    title: '选择游戏安装根目录下的 LeagueClient.exe 或 Game/League of Legends.exe',
    filters: [{ name: 'Executable', extensions: ['exe'] }]
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  const filePath = result.filePaths[0]
  const isValid = await isLeaguePathValid(filePath)
  if (!isValid) {
    // 选错也记录用户实际选的路径，便于排错时确认是否配错（无效路径不影响 LCU 自动探测）
    await setConfigValue('leaguePath', filePath)
    return false
  }

  const finalPath = await normalizeLeaguePath(filePath)
  await setConfigValue('leaguePath', finalPath)
  return true
}

async function normalizeLeaguePath(leaguePath: string): Promise<string> {
  let finalPath = leaguePath

  const normalizedPath = leaguePath.toLowerCase()
  const isExeFile = normalizedPath.endsWith('.exe')
  const isGameDir = normalizedPath.endsWith('game') || normalizedPath.endsWith('game\\')

  if (isExeFile) {
    finalPath = path.dirname(leaguePath)
  }

  if (isGameDir || finalPath.toLowerCase().endsWith('game')) {
    finalPath = path.dirname(finalPath)
  }

  return finalPath
}

/**
 * This function gets the league path from the config file.
 * @returns {Promise<string>} the league path.
 */
export async function getLeaguePath(): Promise<string> {
  const val = await getConfigValue('leaguePath')
  return typeof val === 'string' ? val : ''
}

/**
 * This function checks if the current league path is valid.
 * @returns {Promise<boolean>} true if the current league path is valid, false otherwise.
 */
export async function isCurrentLeaguePathValid(): Promise<boolean> {
  return isLeaguePathValid(await getLeaguePath())
}

export async function getCurrentSkinId(): Promise<string | null> {
  const val = await getConfigValue('currentSkinId')
  return typeof val === 'string' ? val : null
}

export async function setCurrentSkinId(skinId: string | null): Promise<void> {
  await setConfigValue('currentSkinId', skinId ?? '')
}

/**
 * 获取所有英雄的皮肤映射 { championId: skinId }
 */
export async function getChampionSkins(): Promise<Record<string, string>> {
  const config = await readConfig()
  return (config.championSkins as Record<string, string> | null) ?? {}
}

/**
 * 获取指定英雄记住的皮肤ID
 */
export async function getChampionSkinId(championId: number): Promise<string | null> {
  const skins = await getChampionSkins()
  return skins[String(championId)] ?? null
}

/**
 * 设置指定英雄记住的皮肤ID
 */
export async function setChampionSkinId(championId: number, skinId: string): Promise<void> {
  const config = await readConfig()
  const championSkins = (config.championSkins as Record<string, string> | null) ?? {}
  championSkins[String(championId)] = skinId
  config.championSkins = championSkins
  configCache = config
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2))
}

/**
 * 移除指定英雄记住的皮肤ID
 */
export async function removeChampionSkinId(championId: number): Promise<void> {
  const config = await readConfig()
  const championSkins = (config.championSkins as Record<string, string> | null) ?? {}
  delete championSkins[String(championId)]
  config.championSkins = championSkins
  configCache = config
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2))
}

/**
 * 清除所有英雄的皮肤映射
 */
export async function clearAllChampionSkins(): Promise<void> {
  const config = await readConfig()
  config.championSkins = {}
  configCache = config
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2))
}

export async function getFloatWindowEnabled(): Promise<boolean> {
  const val = await getConfigValue('floatWindowEnabled')
  // 默认开启
  return val !== 'false'
}

export async function setFloatWindowEnabled(enabled: boolean): Promise<void> {
  await setConfigValue('floatWindowEnabled', String(enabled))
}

export type FloatWindowPosition = 'right' | 'left' | 'top' | 'bottom'

export async function getFloatWindowPosition(): Promise<FloatWindowPosition> {
  const val = await getConfigValue('floatWindowPosition')
  if (val === 'right' || val === 'left' || val === 'top' || val === 'bottom') return val
  return 'top'
}

export async function setFloatWindowPosition(position: FloatWindowPosition): Promise<void> {
  await setConfigValue('floatWindowPosition', position)
}

/** 悬浮窗是否置顶（默认不置顶；全屏游戏下想看见悬浮窗需手动开启） */
export async function getFloatWindowAlwaysOnTop(): Promise<boolean> {
  const val = await getConfigValue('floatWindowAlwaysOnTop')
  return val === 'true'
}

export async function setFloatWindowAlwaysOnTop(enabled: boolean): Promise<void> {
  await setConfigValue('floatWindowAlwaysOnTop', String(enabled))
}

export async function getMultiChampionSkinEnabled(): Promise<boolean> {
  const val = await getConfigValue('multiChampionSkinEnabled')
  // 默认开启（保持向后兼容）
  return val !== 'false'
}

export async function setMultiChampionSkinEnabled(enabled: boolean): Promise<void> {
  await setConfigValue('multiChampionSkinEnabled', String(enabled))
}

/**
 * This function asks the user to select the local skins folder.
 * @returns {Promise<string | null>} the selected path or null if canceled.
 */
export async function askAndSelectLocalSkins(): Promise<string | null> {
  const { BrowserWindow } = await import('electron')
  const mainWindow = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: '选择本地 skins 文件夹'
  })

  if (result.canceled) return null

  const filePath = result.filePaths[0]
  return filePath
}

// Create the config file if it doesn't exist (also handled by readConfig).
fs.pathExists(CONFIG_PATH).then(async (exists) => {
  if (!exists) await fs.writeFile(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2))
})
