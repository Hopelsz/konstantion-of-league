/**
 * ┌───────────────────────────────────────────────────────────────────────────────┐
 * │ 主进程入口：无主界面的"配置向导 + 托盘 + 悬浮窗"架构                        │
 * │ - 启动时若未完成配置（游戏路径/皮肤目录），弹出配置向导窗口；配置完成后隐藏   │
 * │   到托盘，常驻后台等待 LCU 监控（游戏中选人自动弹出悬浮窗切换皮肤）。          │
 * │ - 已配置完成则启动即后台，不打扰用户。                                        │
 * └───────────────────────────────────────────────────────────────────────────────┘
 */

import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  screen,
  Notification
} from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import './api'
import { type Champion, listChampions, invalidateMetadataCache } from './metadata'
import {
  getFloatWindowPosition,
  getFloatWindowAlwaysOnTop,
  isCurrentLeaguePathValid,
  getConfigValue,
  setConfigValue
} from './config'
import {
  checkLolSkinsExist,
  downloadLolSkinsMetadata,
  getSkinsMetadataState,
  updateSkinsMetadataFromNetwork,
  invalidateExistingSkinsCache
} from './download'
import { setLcuHandlers, startLcuMonitor, stopLcuMonitor, invalidateChampionMap } from './lcu'
import { restoreSkinsOnStartup, invalidateChampionDirCache } from './skins'

import icon from '../../resources/icon.png?asset'
import trayIconPath from '../../build/icon.ico?asset'

let setupWindow: BrowserWindow | null = null
let floatWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

// ---------- 配置向导窗口 ----------

const SETUP_WINDOW_SIZE = { width: 480, height: 580 }

/** 打开配置向导窗口（已存在则显示并聚焦） */
export function openSetupWindow(): void {
  if (setupWindow && !setupWindow.isDestroyed()) {
    setupWindow.show()
    setupWindow.focus()
    return
  }
  createSetupWindow()
}

function setupWindowURL(): { url: string; options?: Record<string, string> } {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    return { url: `${process.env['ELECTRON_RENDERER_URL']}?setup=true` }
  }
  return { url: join(__dirname, '../renderer/index.html'), options: { hash: 'setup' } }
}

function createSetupWindow(): void {
  setupWindow = new BrowserWindow({
    ...SETUP_WINDOW_SIZE,
    show: false,
    frame: false,
    resizable: false,
    autoHideMenuBar: true,
    title: 'Konstantion of League 配置',
    icon,
    backgroundColor: '#000000ff',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  setupWindow.on('ready-to-show', () => {
    setupWindow?.show()
  })

  // 关闭 = 隐藏到托盘，程序保持后台运行（真正退出走托盘菜单）
  setupWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      setupWindow?.hide()
    }
  })

  setupWindow.on('closed', () => {
    setupWindow = null
  })

  setupWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  const { url, options } = setupWindowURL()
  if (options) {
    setupWindow.loadFile(url, options)
  } else {
    setupWindow.loadURL(url)
  }
}

// ---------- 窗口控制 IPC（一次注册，作用于配置向导窗口） ----------

function registerWindowIpc(): void {
  ipcMain.on('window-minimize', () => setupWindow?.minimize())
  ipcMain.on('window-close', () => setupWindow?.close())
  ipcMain.on('window-hide', () => setupWindow?.hide())
  ipcMain.handle('window-is-maximized', () => setupWindow?.isMaximized() ?? false)

  // 渲染进程确认退出时调用
  ipcMain.on('app-quit', () => {
    isQuitting = true
    app.quit()
  })
}

// ---------- 托盘 ----------

function createTray(): void {
  const trayIcon = nativeImage.createFromPath(trayIconPath)
  tray = new Tray(trayIcon)
  tray.setToolTip('Konstantion of League')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '配置游戏与皮肤',
      click: (): void => {
        openSetupWindow()
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: (): void => {
        isQuitting = true
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)

  // 双击托盘图标打开配置窗口
  tray.on('double-click', () => {
    openSetupWindow()
  })
}

// ---------- 悬浮窗口 ----------

function getFloatWindowURL(): string {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    return `${process.env['ELECTRON_RENDERER_URL']}?float=true`
  }
  return join(__dirname, '../renderer/index.html')
}

function getFloatWindowURLOptions(): Record<string, string> {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    return {}
  }
  // 生产环境通过 hash 传参
  return { hash: 'float' }
}

/** 竖向布局固定宽度；横向布局固定高度 */
const FLOAT_VERTICAL_WIDTH = 380
const FLOAT_HORIZONTAL_HEIGHT = 260
/** 竖向/横向的最大尺寸（超出屏幕时收缩），接近原主窗口贴边大小 */
const FLOAT_VERTICAL_MAX_HEIGHT = 760
const FLOAT_HORIZONTAL_MAX_WIDTH = 1100

/**
 * 悬浮窗不再依附主窗口，改为锚定"光标所在显示器"的工作区边缘：
 * 右侧/左侧 → 380 宽纵向列表（垂直居中）；上方/下方 → 横向一排皮肤卡片。
 * 最终宽高收缩、坐标 clamp 到工作区内，避免移出屏幕不可见。
 */
async function computeFloatWindowBounds(): Promise<Electron.Rectangle> {
  const position = await getFloatWindowPosition()
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())

  let width = FLOAT_VERTICAL_WIDTH
  let height = Math.min(FLOAT_VERTICAL_MAX_HEIGHT, workArea.height)
  let x = workArea.x
  let y = workArea.y

  switch (position) {
    case 'right':
      x = workArea.x + workArea.width - width
      y = workArea.y + Math.max(0, (workArea.height - height) / 2)
      break
    case 'left':
      y = workArea.y + Math.max(0, (workArea.height - height) / 2)
      break
    case 'top':
      width = Math.min(FLOAT_HORIZONTAL_MAX_WIDTH, workArea.width)
      height = FLOAT_HORIZONTAL_HEIGHT
      x = workArea.x + Math.max(0, (workArea.width - width) / 2)
      break
    default: // 'bottom'
      width = Math.min(FLOAT_HORIZONTAL_MAX_WIDTH, workArea.width)
      height = FLOAT_HORIZONTAL_HEIGHT
      x = workArea.x + Math.max(0, (workArea.width - width) / 2)
      y = workArea.y + workArea.height - height
  }

  x = Math.min(Math.max(x, workArea.x), workArea.x + workArea.width - width)
  y = Math.min(Math.max(y, workArea.y), workArea.y + workArea.height - height)
  return { x, y, width, height }
}

/** 悬浮窗正在显示时，按最新配置立即重定位（由设置变更触发），并通知渲染进程切换布局 */
export function refreshFloatWindowPosition(): void {
  if (floatWindow && !floatWindow.isDestroyed()) {
    Promise.all([computeFloatWindowBounds(), getFloatWindowPosition()]).then(
      ([bounds, position]) => {
        floatWindow?.setBounds(bounds)
        floatWindow?.webContents.send('float-window-position-changed', position)
      },
    )
  }
}

/** 按最新配置应用悬浮窗置顶状态（窗口创建后、开关切换时调用） */
export function applyFloatWindowAlwaysOnTop(): void {
  if (!floatWindow || floatWindow.isDestroyed()) return
  void getFloatWindowAlwaysOnTop().then((enabled) => {
    floatWindow?.setAlwaysOnTop(enabled)
  })
}

function createFloatWindow(): BrowserWindow {
  floatWindow = new BrowserWindow({
    width: FLOAT_VERTICAL_WIDTH,
    height: FLOAT_VERTICAL_MAX_HEIGHT,
    show: false,
    autoHideMenuBar: true,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    // 初始值跟随默认（不置顶），创建后由 applyFloatWindowAlwaysOnTop 按配置纠正
    alwaysOnTop: false,
    backgroundColor: '#091428ff',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  floatWindow.on('close', () => {
    floatWindow = null
  })

  // 加载页面
  const urlOpts = getFloatWindowURLOptions()
  if (Object.keys(urlOpts).length > 0) {
    floatWindow.loadFile(getFloatWindowURL(), urlOpts)
  } else {
    floatWindow.loadURL(getFloatWindowURL())
  }

  return floatWindow
}

/** 显示悬浮窗并发送英雄数据（窗口不存在则先创建） */
function showFloatWindow(champion: Champion): void {
  try {
    if (floatWindow && !floatWindow.isDestroyed()) {
      // 窗口已存在：更新位置后直接发送数据（渲染进程的 preload 早已订阅监听）
      computeFloatWindowBounds().then((bounds) => floatWindow?.setBounds(bounds))
      floatWindow.show()
      floatWindow.focus()
      floatWindow.webContents.send('float-champion-data', champion)
      return
    }

    // 新建窗口：待页面就绪（preload 监听已注册）后再发送，避免数据丢失
    floatWindow = createFloatWindow()
    applyFloatWindowAlwaysOnTop()
    floatWindow.once('ready-to-show', () => {
      if (floatWindow) {
        computeFloatWindowBounds().then((bounds) => floatWindow?.setBounds(bounds))
        floatWindow.show()
        floatWindow.webContents.send('float-champion-data', champion)
      }
    })
  } catch (err) {
    // 低内存/系统资源紧张时窗口创建或显示可能失败，记录日志避免静默消失
    console.error('[Float] 悬浮窗创建/显示失败:', err)
  }
}

/** 关闭悬浮窗（选人结束/进入游戏时由 LCU 事件触发，或用户手动关闭） */
function hideFloatWindow(): void {
  if (floatWindow && !floatWindow.isDestroyed()) {
    floatWindow.close()
  }
}

function setupFloatWindowIPC(): void {
  // 渲染进程请求显示浮动窗口（兼容旧调用；新架构下主进程 LCU 回调直驱）
  ipcMain.on('show-float-window', (_event, champion: Champion) => {
    showFloatWindow(champion)
  })

  // 渲染进程请求隐藏浮动窗口
  ipcMain.on('hide-float-window', () => {
    hideFloatWindow()
  })
}

/**
 * 调试模式：不依赖游戏"确定英雄"事件，启动后自动显示悬浮窗。
 * 仅 dev 环境生效，设置环境变量 LEAGUE_SKINS_DEBUG_FLOAT=0 可关闭。
 */
function setupDebugFloatWindow(): void {
  if (process.env['LEAGUE_SKINS_DEBUG_FLOAT'] === '0') return
  if (!is.dev) return
  setTimeout(async () => {
    const champions = await listChampions()
    const champion = champions[0]
    if (champion) {
      showFloatWindow(champion)
    }
  }, 1000)
}

// ---------- 启动 ----------

/** 判断首次配置是否完成：游戏路径有效 且 本地皮肤已就绪 */
async function isConfigured(): Promise<boolean> {
  const [pathOk, skinsOk] = await Promise.all([
    isCurrentLeaguePathValid(),
    checkLolSkinsExist().catch(() => false),
  ])
  return pathOk && skinsOk
}

/**
 * 启动自检：线上游戏版本比本地皮肤数据新时后台自动更新，用户无需手动点更新按钮。
 * 更新失败（离线等）保留旧数据，并弹一次托盘通知引导手动更新——
 * 同一版本只提醒一次，避免离线时每次启动都弹。
 */
async function autoUpdateSkinsMetadata(): Promise<void> {
  let stale: { latestPatch: string; metadataPatch: string | null } | null = null
  try {
    const state = await getSkinsMetadataState()
    if (state.upToDate || !state.latestPatch) return
    stale = { latestPatch: state.latestPatch, metadataPatch: state.metadataPatch }

    const count = await updateSkinsMetadataFromNetwork()
    invalidateMetadataCache()
    invalidateExistingSkinsCache()
    invalidateChampionMap()
    invalidateChampionDirCache()
    console.log(
      `[metadata] 游戏已更新（${stale.metadataPatch ?? '未知'} → ${stale.latestPatch}），` +
        `已自动更新 ${count} 条皮肤数据`
    )
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('metadata-updated')
    }
    return
  } catch (err) {
    console.warn('[metadata] 自动更新皮肤数据失败，保持旧数据:', err)
  }

  if (!stale) return
  if ((await getConfigValue('metadataRemindPatch')) === stale.latestPatch) return
  await setConfigValue('metadataRemindPatch', stale.latestPatch).catch(() => {})
  new Notification({
    title: '皮肤数据有更新',
    body: `游戏已更新到 ${stale.latestPatch}，打开配置窗口点右上角更新按钮`
  }).show()
}

async function boot(): Promise<void> {
  // LCU 事件由主进程直接驱动悬浮窗（无需任何渲染窗口存活）
  setLcuHandlers({
    onChampionSelected: (champion) => showFloatWindow(champion),
    onChampSelectEnded: () => hideFloatWindow(),
  })

  // 确保离线元数据可用，让 LCU 英雄表 / 皮肤列表后台就绪
  try {
    await downloadLolSkinsMetadata()
  } catch (err) {
    console.warn('元数据初始化失败:', err)
  }

  // 游戏更新后自动刷新皮肤数据（后台进行，失败不阻塞启动）
  void autoUpdateSkinsMetadata()

  // 启动恢复记忆皮肤：上一会话的 overlay 随进程退出消亡，但配置仍记着
  // 各英雄的皮肤（悬浮窗会显示"已应用"角标），这里重建 mod/overlay 使其
  // 真正生效；文件已丢失的记忆项会被清除。失败不阻塞启动。
  void restoreSkinsOnStartup().catch((err) => {
    console.warn('启动恢复皮肤失败:', err)
  })

  // 常驻后台监控游戏
  startLcuMonitor()

  // 首次使用（未完成配置）→ 弹配置向导；已配置 → 启动即后台
  if (!(await isConfigured())) {
    openSetupWindow()
  }

  // dev 环境：启动即显示悬浮窗，便于调试布局
  setupDebugFloatWindow()
}

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
}

app.whenReady().then(() => {
  // 与 electron-builder.yml 的 appId 保持一致，保证任务栏图标/通知归组正确
  electronApp.setAppUserModelId('com.cslol.app')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  // 第二次启动时恢复配置窗口，而不是创建新实例
  app.on('second-instance', () => {
    openSetupWindow()
  })

  registerWindowIpc()
  setupFloatWindowIPC()
  createTray()
  boot().catch((err) => {
    console.error('启动流程异常:', err)
    // 启动失败也保证有窗口可配置/操作
    openSetupWindow()
  })

  app.on('activate', function () {
    openSetupWindow()
  })
})

// 所有窗口关闭时不退出（因为有托盘运行）
app.on('window-all-closed', () => {
  // 不自动退出，托盘保持运行
})

// 应用真正退出前清理托盘与监控
app.on('before-quit', () => {
  isQuitting = true
  stopLcuMonitor()
  if (floatWindow && !floatWindow.isDestroyed()) {
    floatWindow.close()
  }
  if (tray) {
    tray.destroy()
    tray = null
  }
})
