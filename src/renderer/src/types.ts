/// <reference types="vite/client" />

export interface Champion {
  id: number
  name: string
  alias: string
  key: string
  nicknames: string[]
  roles: string[]
  image: string
  imageAlt: string
  imageAlt2: string
}

export interface Skin {
  id: number
  championId: number
  championName?: string
  name: string
  image: string
  imageAlt: string
  imageAlt2: string
  chromas?: Chroma[]
}

export interface Chroma {
  id: number
  championId: number
  championName?: string
  name: string
  colors?: string[]
}

export type CloseBehavior = 'ask' | 'tray' | 'quit'

export type FloatWindowPosition = 'right' | 'left' | 'top' | 'bottom'

/** 皮肤元数据版本状态 */
export interface SkinsMetadataState {
  /** 本地元数据是否已对齐当前线上游戏版本 */
  upToDate: boolean
  /** 当前线上最新游戏版本（获取失败为 null） */
  latestPatch: string | null
  /** 本地元数据对应的游戏版本（从未在线更新过为 null） */
  metadataPatch: string | null
}

export interface ConfigPaths {
  leaguePath: string
  skinsPath: string
  skinsAvailable: boolean
  skinsLocation: string
  leaguePathValid: boolean
}

export interface Api {
  // 配置向导
  getConfigPaths: () => Promise<ConfigPaths>
  openSetupWindow: () => void
  isCurrentLeaguePathValid: () => Promise<boolean>
  askAndSetLeaguePath: () => Promise<boolean | null>
  askAndSelectLocalSkins: () => Promise<string | null>
  useLocalLolSkins: (localPath: string) => Promise<void>
  updateSkinsMetadata: () => Promise<number>
  getSkinsMetadataState: () => Promise<SkinsMetadataState>
  checkLolSkinsExist: () => Promise<boolean>
  listSkins: () => Promise<Skin[]>
  getExistingSkins: () => Promise<Skin[]>
  listChampions: () => Promise<Champion[]>
  setSkin: (skin: Skin | Chroma) => Promise<void>
  disableSkin: (championId?: number) => Promise<void>
  clearAllSkins: () => Promise<void>
  getChampionSkinsDetail: () => Promise<
    Array<{ championId: number; championName: string; skinId: string; skinName: string }>
  >
  getCurrentSkinId: () => Promise<string | null>
  getChampionSkinId: (championId: number) => Promise<string | null>
  getAppVersion: () => Promise<string>
  minimizeWindow: () => void
  maximizeWindow: () => void
  closeWindow: () => void
  hideWindow: () => void
  quitApp: () => void
  isWindowMaximized: () => Promise<boolean>
  onWindowMaximized: (callback: (maximized: boolean) => void) => () => void
  getCloseBehavior: () => Promise<CloseBehavior>
  setCloseBehavior: (behavior: CloseBehavior) => Promise<void>
  getFloatWindowEnabled: () => Promise<boolean>
  setFloatWindowEnabled: (enabled: boolean) => Promise<void>
  getFloatWindowPosition: () => Promise<FloatWindowPosition>
  setFloatWindowPosition: (position: FloatWindowPosition) => Promise<void>
  getMultiChampionSkinEnabled: () => Promise<boolean>
  setMultiChampionSkinEnabled: (enabled: boolean) => Promise<void>
  // 浮动窗口
  showFloatWindow: (champion: Champion) => void
  hideFloatWindow: () => void
  onFloatChampionData: (callback: (champion: Champion) => void) => () => void
  onFloatWindowPositionChanged: (callback: (position: FloatWindowPosition) => void) => () => void
  // 皮肤状态同步
  onSkinStateChanged: (callback: (championId: number, skinId: string | null) => void) => () => void
  // LCU 通信事件
  onLcuChampionSelected: (callback: (champion: Champion) => void) => () => void
  onLcuChampSelectEnded: (callback: () => void) => () => void
}

declare global {
  interface Window {
    api: Api
  }
}
