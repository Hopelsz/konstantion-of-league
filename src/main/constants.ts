/**
 * ┌───────────────────────────────────────────────────────────────┐
 * │ This module includes constants used by other modules.         │
 * └───────────────────────────────────────────────────────────────┘
 */

import { app } from 'electron'
import path from 'path'

const USER_DATA = app.getPath('userData')

export const CONFIG_PATH = path.join(USER_DATA, 'config.json')

export const CSLOL_MANAGER_LOCATION = app.isPackaged
  ? path.join(process.resourcesPath, 'cslol')
  : path.join(__dirname, '..', '..', 'cslol')

export const CSLOL_MANAGER_EXECUTABLE = path.join(CSLOL_MANAGER_LOCATION, 'mod-tools.exe')
export const CSLOL_MANAGER_CONFIG = path.join(CSLOL_MANAGER_LOCATION, 'config.ini')

export const LOL_SKINS_LOCATION = path.join(app.getPath('desktop'), 'skins')

export const LOL_SKINS_METADATA_LOCATION = path.join(USER_DATA, 'skins_metadata.json')
/** 内置元数据兜底文件：当网络不通时使用打包在资源中的元数据 */
export const LOL_SKINS_METADATA_FALLBACK = app.isPackaged
  ? path.join(process.resourcesPath, 'skins_metadata.json')
  : path.join(__dirname, '..', '..', 'resources', 'skins_metadata.json')

export const TEMP_DIR = path.join(USER_DATA, 'temp')
