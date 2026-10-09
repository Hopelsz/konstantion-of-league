import { useCallback, useEffect, useRef, useState } from 'react'

import { useAlert } from '@renderer/hooks/Alert'
import { FloatWindowPosition, SkinsMetadataState } from '../types'

type ConfigPaths = Awaited<ReturnType<typeof window.api.getConfigPaths>>

/** 按钮/忙碌状态：空串表示空闲 */
type Busy = '' | 'game' | 'skins' | 'metadata'

const gold = '#c8aa6e'

function SetupWindow(): JSX.Element {
  const { setAlert } = useAlert()
  const hasApi = typeof window !== 'undefined' && !!window.api
  const [config, setConfig] = useState<ConfigPaths | null>(null)
  const [busy, setBusy] = useState<Busy>('')
  // 设置面板
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [multiEnabled, setMultiEnabled] = useState(true)
  const [floatPosition, setFloatPosition] = useState<FloatWindowPosition>('right')
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null)
  const msgTimer = useRef<number | null>(null)
  // 皮肤元数据版本状态（null = 尚未加载完成）
  const [metaState, setMetaState] = useState<SkinsMetadataState | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    const cfg = await window.api.getConfigPaths()
    setConfig(cfg)
  }, [])

  /** 查询元数据版本状态：决定顶部更新按钮的可用性 */
  const refreshMetaState = useCallback(async (): Promise<void> => {
    try {
      setMetaState(await window.api.getSkinsMetadataState())
    } catch {
      setMetaState(null) // 查询失败保持可点，允许用户手动重试
    }
  }, [])

  useEffect(() => {
    if (!hasApi) return // 浏览器预览模式（无 preload）只展示静态界面
    refresh().catch(() => setAlert('读取配置失败，请重试', 'error'))
    void refreshMetaState()
  }, [refresh, setAlert, hasApi, refreshMetaState])

  // 主进程后台自动更新完皮肤数据后刷新版本状态，及时隐藏过期提示
  useEffect(() => {
    if (!hasApi) return
    return window.api.onMetadataUpdated(() => {
      void refreshMetaState()
    })
  }, [hasApi, refreshMetaState])

  // 定时刷新版本状态（与主进程缓存 TTL 一致）：窗口常驻期间新版本上线也能提示
  useEffect(() => {
    if (!hasApi) return
    const timer = window.setInterval(() => void refreshMetaState(), 10 * 60 * 1000)
    return () => window.clearInterval(timer)
  }, [hasApi, refreshMetaState])

  // 卸载时清理设置面板的提示定时器
  useEffect(() => {
    return () => {
      if (msgTimer.current) window.clearTimeout(msgTimer.current)
    }
  }, [])

  const gamePath = config?.leaguePath ?? ''
  const skinsPath = config?.skinsPath || config?.skinsLocation || ''
  /** 设置了游戏路径但实测无效（如选错文件）→ 显示红 × */
  const gameSet = !!config?.leaguePath
  const gameDone = !!config?.leaguePathValid
  /** 用户主动配置过皮肤目录（向导引导的是自定义目录导入） */
  const skinsSet = !!config?.skinsPath
  const skinsDone = !!config?.skinsAvailable

  const handleGame = async (): Promise<void> => {
    if (!hasApi) return
    setBusy('game')
    try {
      const ok = await window.api.askAndSetLeaguePath()
      await refresh()
      if (ok === null) return // 用户取消选择，不做任何提示
      if (ok) setAlert('游戏路径设置成功')
      else setAlert('路径无效，请选择游戏安装根目录下的 LeagueClient.exe 或 Game/League of Legends.exe', 'error')
    } finally {
      setBusy('')
    }
  }

  const handleSkins = async (): Promise<void> => {
    if (!hasApi) return
    setBusy('skins')
    try {
      const localPath = await window.api.askAndSelectLocalSkins()
      if (localPath) {
        await window.api.useLocalLolSkins(localPath)
        await refresh()
        setAlert('本地皮肤导入成功')
      }
    } catch (error) {
      await refresh()
      setAlert(error instanceof Error ? error.message : '导入失败', 'error')
    } finally {
      setBusy('')
    }
  }

  const flashMsg = (text: string): void => {
    setSettingsMsg(text)
    if (msgTimer.current) window.clearTimeout(msgTimer.current)
    msgTimer.current = window.setTimeout(() => setSettingsMsg(null), 2600)
  }

  /** 打开设置面板时读取各开关与悬浮窗位置 */
  const loadSettings = async (): Promise<void> => {
    if (!hasApi) return
    const [multi, position] = await Promise.all([
      window.api.getMultiChampionSkinEnabled(),
      window.api.getFloatWindowPosition(),
    ])
    setMultiEnabled(multi)
    setFloatPosition(position)
    setSettingsMsg(null)
  }

  const toggleSettings = (): void => {
    const next = !settingsOpen
    setSettingsOpen(next)
    if (next) void loadSettings()
  }

  const handlePositionChange = async (position: FloatWindowPosition): Promise<void> => {
    if (!hasApi) return
    setFloatPosition(position)
    await window.api.setFloatWindowPosition(position)
  }

  const handleToggleMulti = async (next: boolean): Promise<void> => {
    if (!hasApi) return
    setMultiEnabled(next)
    await window.api.setMultiChampionSkinEnabled(next)
    if (!next) {
      await window.api.clearAllSkins()
      flashMsg('已关闭多英雄模式并清除已记住的皮肤')
    } else {
      flashMsg('多英雄皮肤已开启')
    }
  }

  /** 在线更新皮肤元数据：新英雄/新皮肤上线后，无需升级应用即可识别 */
  const handleUpdateMetadata = async (): Promise<void> => {
    if (!hasApi || busy === 'metadata') return
    // 已对齐线上版本时禁止点击：避免换肤失败的用户乱点导致无意义请求
    if (metaState?.upToDate) return
    setBusy('metadata')
    try {
      const count = await window.api.updateSkinsMetadata()
      setAlert(`皮肤数据已更新（共 ${count} 个皮肤），新皮肤即刻可用`)
    } catch (error) {
      setAlert(error instanceof Error ? `更新失败：${error.message}` : '更新失败，请检查网络', 'error')
    } finally {
      setBusy('')
      void refreshMetaState()
    }
  }

  const hideToTray = (): void => {
    window.api?.hideWindow()
  }

  const confCardStyle: React.CSSProperties = {
    background: 'rgba(13, 24, 44, 0.75)',
    border: '1px solid rgba(120, 91, 40, 0.35)',
    borderRadius: '8px',
    padding: '1rem 1.1rem',
    marginBottom: '0.9rem'
  }

  const labelStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.45rem',
    fontSize: '0.82rem',
    fontFamily: 'Beaufort, sans-serif',
    letterSpacing: '0.06em',
    color: '#f0e6d2',
    marginBottom: '0.35rem'
  }

  /** 路径文本三态配色：未设置(灰) / 有效(青灰) / 无效(红) */
  const pathTextStyle = (set: boolean, done: boolean): React.CSSProperties => ({
    display: 'block',
    color: !set ? '#5a6570' : done ? '#7a8a99' : '#f87171',
    fontSize: '0.72rem',
    fontFamily: 'Consolas, monospace',
    wordBreak: 'break-all',
    lineHeight: 1.5,
    minHeight: '1.2em'
  })

  const primaryBtnStyle: React.CSSProperties = {
    border: '1px solid #c8aa6e',
    borderRadius: '4px',
    background: 'transparent',
    color: '#c8aa6e',
    padding: '0.5rem 1.2rem',
    fontFamily: 'Beaufort, sans-serif',
    fontSize: '0.82rem',
    letterSpacing: '0.05em',
    cursor: busy ? 'not-allowed' : 'pointer',
    opacity: busy ? 0.5 : 1,
    whiteSpace: 'nowrap'
  }

  const doneIcon = (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-label="已完成">
      <circle cx="12" cy="12" r="10" fill="#785a28" stroke="#c8aa6e" strokeWidth="1.2" />
      <path d="M7.5 12.5l3 3 6-6.5" stroke="#f0e6d2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
  const failIcon = (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-label="无效">
      <circle cx="12" cy="12" r="10" fill="#5a1f22" stroke="#f87171" strokeWidth="1.2" />
      <path d="M8.5 8.5l7 7m0-7l-7 7" stroke="#f87171" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )

  return (
    <div style={{ position: 'relative', height: '100vh', display: 'flex', flexDirection: 'column', userSelect: 'none' }}>
      {/* 顶部拖拽栏 */}
      <div
        className="window-drag-region"
        style={{
          flexShrink: 0,
          height: '40px',
          display: 'flex',
          alignItems: 'center',
          padding: '0 0 0 12px',
          borderBottom: '1px solid rgba(120, 91, 40, 0.25)'
        }}
      >
        <span style={{ fontSize: '12px', color: gold, letterSpacing: '0.08em' }}>
          Konstantion of League — 配置
        </span>
        <div
          className="window-no-drag"
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', height: '100%' }}
        >
          {/* 皮肤数据更新按钮：仅当本地元数据落后于线上版本时可点 */}
          <button
            onClick={handleUpdateMetadata}
            disabled={busy === 'metadata' || metaState?.upToDate === true}
            title={
              busy === 'metadata'
                ? '正在更新皮肤元数据…'
                : metaState === null
                  ? '正在检查皮肤元数据版本…'
                  : metaState.upToDate
                    ? `皮肤元数据已是最新（版本 ${metaState.latestPatch}）`
                    : metaState.latestPatch
                      ? `检测到新版本 ${metaState.latestPatch}，点击更新皮肤元数据`
                      : '无法获取游戏版本，点击重试'
            }
            style={{
              ...btnSquareStyle,
              position: 'relative',
              opacity: metaState?.upToDate ? 0.4 : 1,
              cursor: busy === 'metadata' || metaState?.upToDate ? 'default' : 'pointer'
            }}
            onMouseEnter={(e) => {
              if (busy !== 'metadata' && metaState?.upToDate !== true) e.currentTarget.style.background = '#394c74ff'
            }}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              style={{
                shapeRendering: 'geometricPrecision',
                animation: busy === 'metadata' ? 'spin 1s linear infinite' : undefined,
                color: metaState?.upToDate ? '#a09b8c' : '#f0e6d2'
              }}
            >
              <path
                fill="currentColor"
                d="M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
              />
            </svg>
            {/* 有更新时的金色圆点提示 */}
            {metaState && !metaState.upToDate && busy !== 'metadata' && (
              <span
                style={{
                  position: 'absolute',
                  top: '8px',
                  right: '9px',
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: '#c8aa6e',
                  boxShadow: '0 0 4px #c8aa6e'
                }}
              />
            )}
          </button>
          <button
            onClick={toggleSettings}
            title="设置"
            style={btnSquareStyle}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#394c74ff')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              style={{ shapeRendering: 'geometricPrecision', imageRendering: 'crisp-edges' }}
            >
              <path
                fill="#f0e6d2"
                d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.39-1.08-.7-1.66-.94l-.38-2.65c-.03-.24-.24-.42-.48-.42h-4c-.24 0-.45.18-.48.42l-.38 2.65c-.58.24-1.14.55-1.66.94l-2.49-1c-.22-.08-.49 0-.61.22l-2 3.46c-.12.22-.07.49.12.64l2.11 1.65c-.04.32-.07.64-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.39 1.08.7 1.66.94l.38 2.65c.03.24.24.42.48.42h4c.24 0 .45-.18.48-.42l.38-2.65c.58-.24 1.14-.55 1.66-.94l2.49 1c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zm-7.43 2.52c-2.2 0-4-1.8-4-4s1.8-4 4-4 4 1.8 4 4-1.8 4-4 4z"
              />
            </svg>
          </button>
          <button
            onClick={hideToTray}
            title="隐藏到后台"
            style={btnSquareStyle}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#394c74ff')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <svg width="12" height="2" viewBox="0 0 12 2">
              <rect fill="#f0e6d2" width="12" height="2" rx="1" />
            </svg>
          </button>
        </div>
      </div>

      {/* 皮肤数据过期提示：自动更新失败（如离线）时引导手动更新 */}
      {metaState && !metaState.upToDate && metaState.latestPatch && busy !== 'metadata' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 1.3rem',
            background: 'linear-gradient(90deg, #3a2f14 0%, #241d0e 100%)',
            borderBottom: '1px solid #785b2866',
            fontSize: '0.72rem',
            color: '#f0e6d2'
          }}
        >
          <span style={{ color: gold, flexShrink: 0 }}>↑</span>
          <span style={{ flex: 1, lineHeight: 1.5 }}>
            游戏已更新到 {metaState.latestPatch}
            {metaState.metadataPatch ? `，皮肤数据停留在 ${metaState.metadataPatch}` : ''}
            ，点右上角更新
          </span>
        </div>
      )}

      {/* 内容区 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1.2rem 1.3rem' }}>
        {/* 头部说明 */}
        <div style={{ textAlign: 'center', marginBottom: '1.1rem' }}>
          <svg width="52" height="52" viewBox="0 0 64 64" fill="none" style={{ marginBottom: '0.4rem' }}>
            <rect width="64" height="64" rx="14" fill="#0A1428" />
            <path
              d="M32 10L10 20v10c0 14.7 8.96 28.4 22 32 13.04-3.6 22-17.3 22-32V20L32 10z"
              fill="#C8AA6E"
              stroke="#F0E6D2"
              strokeWidth="2"
            />
            <text x="32" y="43" textAnchor="middle" fill="#0A1428" fontSize="26" fontWeight="bold" fontFamily="Beaufort">
              L
            </text>
          </svg>
          <h3 style={{ margin: '0 0 0.35rem', fontSize: '1.15rem', color: '#f0e6d2' }}>
            欢迎使用 Konstantion of League
          </h3>
          <p style={{ margin: 0, fontSize: '0.74rem', color: '#7a8a99', lineHeight: 1.6 }}>
            配置完成后自动转入后台运行（托盘常驻）
            <br />
            游戏中选定英雄时自动弹出悬浮窗，即点即换皮肤
          </p>
        </div>

        {/* 1. 游戏路径 */}
        <div style={confCardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem' }}>
            <div style={{ minWidth: 0 }}>
              <div style={labelStyle}>
                {gameDone && doneIcon}
                {!gameDone && gameSet && failIcon}
                <span>游戏路径</span>
              </div>
              <code style={pathTextStyle(gameSet, gameDone)}>
                {gameSet
                  ? gameDone
                    ? gamePath
                    : `${gamePath}  — 路径无效，请重新选择`
                  : '未设置 — 请选择根目录的 LeagueClient.exe 或 Game/League of Legends.exe'}
              </code>
            </div>
            <button style={primaryBtnStyle} onClick={handleGame} disabled={!!busy}>
              {busy === 'game' ? '校验中…' : gameDone ? '重新选择' : '选择游戏'}
            </button>
          </div>
        </div>

        {/* 2. 本地皮肤目录 */}
        <div style={confCardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem' }}>
            <div style={{ minWidth: 0 }}>
              <div style={labelStyle}>
                {skinsDone && doneIcon}
                {!skinsDone && skinsSet && failIcon}
                <span>本地皮肤目录</span>
              </div>
              <code style={pathTextStyle(skinsSet, skinsDone)}>
                {skinsSet
                  ? skinsDone
                    ? skinsPath
                    : `${skinsPath}  — 目录无效或缺少皮肤文件，请重新导入`
                  : '未设置 — 导入已下载的 skins 皮肤文件夹'}
              </code>
            </div>
            <button style={primaryBtnStyle} onClick={handleSkins} disabled={!!busy}>
              {busy === 'skins' ? '导入中…' : skinsDone ? '重新导入' : '选择文件夹'}
            </button>
          </div>
          <p style={{ margin: '0.6rem 0 0', fontSize: '0.66rem', color: '#5a6570', lineHeight: 1.6 }}>
            皮肤文件夹需包含「英雄名目录 → 皮肤文件(.fantome/.zip)」结构。
            <br />
            暂无本地皮肤时，可先隐藏到后台，之后从托盘打开本窗口，通过右上角「设置」随时补充。
          </p>
        </div>

        {/* 3. 完成提示 */}
        {!busy && (
          <div
            style={{
              textAlign: 'center',
              fontSize: '0.72rem',
              color: gameDone && skinsDone ? gold : '#5a6570',
              marginTop: '0.2rem',
              minHeight: '1.2em'
            }}
          >
            {gameDone && skinsDone
              ? '配置完成 — 之后启动将直接后台待命，不再弹出此窗口'
              : '还有配置项未完成，可先隐藏到后台，稍后从托盘图标再次打开此窗口'}
          </div>
        )}

        {/* 完成按钮 */}
        <div style={{ textAlign: 'center', marginTop: '1rem' }}>
          <button
            onClick={hideToTray}
            disabled={!!busy}
            style={{
              padding: '0.7rem 2.2rem',
              fontSize: '0.9rem',
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.5 : 1,
              border: 'none',
              borderRadius: '4px',
              color: '#0a1428',
              background: 'linear-gradient(135deg, #d4b87a 0%, #8b6a35 100%)',
              fontWeight: 600,
              letterSpacing: '0.06em',
              fontFamily: 'Beaufort, sans-serif'
            }}
          >
            隐藏到后台，开始使用
          </button>
          <p style={{ margin: '0.7rem 0 0', fontSize: '0.64rem', color: '#5a6570' }}>
            如需退出程序，请右键系统托盘图标选择「退出」
          </p>
        </div>
      </div>

      {/* 设置面板覆盖层 */}
      {settingsOpen && (
        <div
          onClick={() => setSettingsOpen(false)}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(2, 8, 18, 0.72)'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(92%, 340px)',
              maxHeight: '92%',
              overflowY: 'auto',
              background: 'linear-gradient(180deg, #0d1931 0%, #0a1428 100%)',
              border: '1px solid #785b28',
              borderRadius: '10px',
              padding: '0.9rem 1rem 1rem',
              boxShadow: '0 10px 36px rgba(0,0,0,0.55)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
              <span style={{ fontFamily: 'Beaufort, sans-serif', fontSize: '1rem', letterSpacing: '0.08em', color: '#f0e6d2' }}>
                设置
              </span>
              <button
                onClick={() => setSettingsOpen(false)}
                title="关闭设置"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#a09b8c', padding: '2px' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="settings-section">
              <h4>悬浮窗</h4>
              <span className="settings-radio-label">悬浮窗位置</span>
              <div className="settings-segmented" style={{ display: 'flex', width: '100%' }}>
                {([
                  ['right', '右侧'],
                  ['left', '左侧'],
                  ['top', '上方'],
                  ['bottom', '下方'],
                ] as [FloatWindowPosition, string][]).map(([value, label]) => (
                  <button
                    key={value}
                    className={`segmented-btn ${floatPosition === value ? 'active' : ''}`}
                    style={{ flex: 1 }}
                    onClick={() => handlePositionChange(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="settings-toggle-item">
                <div className="settings-toggle-text">
                  <span className="settings-toggle-title">多英雄皮肤</span>
                  <span className="settings-toggle-desc">
                    {multiEnabled ? '可为多个英雄分别应用不同皮肤' : '一次仅为一个英雄应用皮肤'}
                  </span>
                </div>
                <label
                  className={`toggle-switch ${multiEnabled ? 'active' : ''}`}
                  onClick={() => handleToggleMulti(!multiEnabled)}
                >
                  <span className="toggle-slider" />
                </label>
              </div>
            </div>

            {settingsMsg && (
              <p
                style={{
                  margin: '0.3rem 0 0',
                  fontSize: '0.72rem',
                  color: '#c8aa6e',
                  textAlign: 'center',
                  lineHeight: 1.5,
                  wordBreak: 'break-all'
                }}
              >
                {settingsMsg}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const btnSquareStyle: React.CSSProperties = {
  width: '46px',
  height: '40px',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0
}

export default SetupWindow
