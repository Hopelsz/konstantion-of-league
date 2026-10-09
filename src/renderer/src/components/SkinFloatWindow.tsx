import { useState, useEffect, useCallback, useRef } from 'react'

import { Champion, Skin, Chroma, FloatWindowPosition } from '../types'
import ImageLoader from '@renderer/components/ImageLoader'

export default function SkinFloatWindow(): JSX.Element {
  const [champion, setChampion] = useState<Champion | null>(null)
  const [allSkins, setAllSkins] = useState<Skin[]>([])
  const [currentSkinId, setCurrentSkinId] = useState<string | null>(null)
  const [isApplying, setIsApplying] = useState(false)
  const [applyingId, setApplyingId] = useState<string | null>(null)  // 正在应用中的皮肤ID
  const [dataLoading, setDataLoading] = useState(false)  // 初次加载皮肤数据
  const [position, setPosition] = useState<FloatWindowPosition>('top')
  const [alwaysOnTop, setAlwaysOnTop] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollAnimRef = useRef<number | null>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  /** 加载指定英雄的皮肤列表与当前应用皮肤（悬浮窗主数据源） */
  const loadSkinsFor = async (champ: Champion): Promise<void> => {
    setDataLoading(true)
    try {
      const skins = await window.api.getExistingSkins()
      setAllSkins(skins)
      // 获取该英雄当前记住的皮肤
      const rememberedSkinId = await window.api.getChampionSkinId(champ.id)
      if (rememberedSkinId) {
        setCurrentSkinId(rememberedSkinId)
      } else {
        // 单英雄模式：没有 per-champion 映射时，检查全局 currentSkinId
        const multi = await window.api.getMultiChampionSkinEnabled()
        if (!multi) {
          const globalSkinId = await window.api.getCurrentSkinId()
          setCurrentSkinId(globalSkinId)
        } else {
          setCurrentSkinId(null)
        }
      }
    } catch {
      setAllSkins([])
    } finally {
      setDataLoading(false)
    }
  }

  // 监听来自主进程的英雄数据
  useEffect(() => {
    const unsubscribe = window.api.onFloatChampionData(async (champ: Champion) => {
      setChampion(champ)
      // 读取当前悬浮窗位置（上方/下方时切换横向布局）
      setPosition(await window.api.getFloatWindowPosition())
      setAlwaysOnTop(await window.api.getFloatWindowAlwaysOnTop())
      await loadSkinsFor(champ)
    })

    // 主进程切换悬浮窗位置时，实时切换布局
    const unsubPos = window.api.onFloatWindowPositionChanged((pos) => setPosition(pos))
    return () => {
      unsubscribe()
      unsubPos()
    }
  }, [])

  // 监听皮肤状态变更（来自另一个窗口的操作）
  useEffect(() => {
    const unsubscribe = window.api.onSkinStateChanged((championId: number, skinId: string | null) => {
      setCurrentSkinId((prev) => {
        // 只更新当前英雄的皮肤状态
        if (champion && champion.id === championId) {
          return skinId
        }
        return prev
      })
    })
    return unsubscribe
  }, [champion])

  // 关闭浮窗
  const handleClose = useCallback(() => {
    window.api.hideFloatWindow()
  }, [])

  const championSkins = champion
    ? allSkins.filter((skin) => skin.championId === champion.id && skin.id !== 0)
    : []

  const isHorizontal = position === 'top' || position === 'bottom'

  // 根据滚动位置更新箭头可见性（横向布局溢出时显示）
  const updateScrollButtons = useCallback((): void => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 1)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [])

  // 皮肤列表渲染完成或位置切换后，重新检查是否溢出
  useEffect(() => {
    if (!isHorizontal || dataLoading) return
    const timer = setTimeout(updateScrollButtons, 50)
    return () => clearTimeout(timer)
  }, [isHorizontal, dataLoading, championSkins.length, updateScrollButtons])

  // 横向滚动：按整卡翻页（3 张），rAF 缓动动画保证平滑，连点自动衔接
  const scrollByPage = useCallback((dir: -1 | 1): void => {
    const el = scrollRef.current
    if (!el) return
    if (scrollAnimRef.current !== null) cancelAnimationFrame(scrollAnimRef.current)
    const step = (110 + 6.4) * 3 // 卡片宽 + gap，3 张一页
    const start = el.scrollLeft
    const target = start + dir * step
    const duration = 300
    const startTime = performance.now()
    const animate = (now: number): void => {
      const t = Math.min((now - startTime) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3) // easeOutCubic
      el.scrollLeft = start + (target - start) * eased
      scrollAnimRef.current = t < 1 ? requestAnimationFrame(animate) : null
    }
    scrollAnimRef.current = requestAnimationFrame(animate)
  }, [])

  // 鼠标滚轮横向滑动（仅横向布局）：滚轮转水平滚动 + rAF 平滑
  useEffect(() => {
    if (!isHorizontal) return
    const el = scrollRef.current
    if (!el) return
    let wheelTarget: number | null = null
    let wheelRaf: number | null = null

    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      // 箭头翻页动画进行中先取消，避免两套 rAF 争抢 scrollLeft
      if (scrollAnimRef.current !== null) {
        cancelAnimationFrame(scrollAnimRef.current)
        scrollAnimRef.current = null
      }
      const max = el.scrollWidth - el.clientWidth
      wheelTarget = Math.max(0, Math.min(max, el.scrollLeft + e.deltaY + e.deltaX))
      if (wheelRaf !== null) return
      const animate = (): void => {
        if (wheelTarget === null) {
          wheelRaf = null
          return
        }
        const diff = wheelTarget - el.scrollLeft
        if (Math.abs(diff) < 0.5) {
          el.scrollLeft = wheelTarget
          wheelTarget = null
          wheelRaf = null
          return
        }
        el.scrollLeft += diff * 0.25
        wheelRaf = requestAnimationFrame(animate)
      }
      wheelRaf = requestAnimationFrame(animate)
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
      if (wheelRaf !== null) cancelAnimationFrame(wheelRaf)
    }
  }, [isHorizontal, champion])

  const isSkinOrChromaApplied = (skin: Skin): boolean => {
    if (`${skin.championId}-${skin.id}` === currentSkinId) return true
    return (
      skin.chromas?.some(
        (chroma) => `${chroma.championId}-${chroma.id}` === currentSkinId
      ) ?? false
    )
  }

  const handleApplySkin = async (skin: Skin): Promise<void> => {
    if (isApplying) return
    const skinKey = `${skin.championId}-${skin.id}`
    setIsApplying(true)
    setApplyingId(skinKey)
    try {
      if (skinKey === currentSkinId) {
        await window.api.disableSkin(skin.championId)
        setCurrentSkinId(null)
        return
      }
      await window.api.setSkin(skin)
      setCurrentSkinId(skinKey)
    } finally {
      setIsApplying(false)
      setApplyingId(null)
    }
  }

  const handleTogglePin = async (): Promise<void> => {
    const next = !alwaysOnTop
    setAlwaysOnTop(next)
    try {
      await window.api.setFloatWindowAlwaysOnTop(next)
    } catch {
      setAlwaysOnTop(!next) // 写入失败回滚，避免显示与实际不一致
    }
  }

  const handleApplyChroma = async (chroma: Chroma): Promise<void> => {
    if (isApplying) return
    const chromaId = `${chroma.championId}-${chroma.id}`
    setIsApplying(true)
    setApplyingId(chromaId)
    try {
      if (chromaId === currentSkinId) {
        await window.api.disableSkin(chroma.championId)
        setCurrentSkinId(null)
        return
      }
      await window.api.setSkin(chroma)
      setCurrentSkinId(chromaId)
    } finally {
      setIsApplying(false)
      setApplyingId(null)
    }
  }

  if (!champion) {
    return (
      <div className="float-window-empty">
        <p>等待选择英雄...</p>
      </div>
    )
  }

  return (
    <div className="float-window">
      {/* 标题栏 - 可拖动 */}
      <div className="float-window-header">
        <div className="float-window-title">
          <span className="float-window-champion-name">{champion.name}</span>
          <span className="float-window-champion-alias">{champion.alias}</span>
        </div>
        <div className="float-window-header-actions">
          <span className="float-window-skin-count">{championSkins.length} 个皮肤</span>
          <div className="float-window-header-divider" />
          <button
            className={`float-window-pin ${alwaysOnTop ? 'active' : ''}`}
            onClick={handleTogglePin}
            title={alwaysOnTop ? '已置顶，点击取消置顶' : '未置顶，点击置顶'}
          >
            <svg width="12" height="12" viewBox="0 0 24 24">
              <path d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z" />
            </svg>
          </button>
          <button className="float-window-close" onClick={handleClose} title="关闭">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="#a09b8c" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* 皮肤列表（上方/下方时横向一排展示） */}
      <div className="float-skin-scroll-wrap">
        <div
          className={`float-window-body ${isHorizontal ? 'horizontal' : ''}`}
          ref={scrollRef}
          onScroll={updateScrollButtons}
        >
          {dataLoading ? (
            <div className="float-window-empty">
              <div className="float-window-spinner" />
              <p>加载皮肤数据...</p>
            </div>
          ) : championSkins.length === 0 ? (
            <div className="float-window-empty">
              <p>该英雄暂无可用皮肤</p>
              <p style={{ fontSize: '0.72em', color: '#7a8a99' }}>请在配置窗口右上角「设置」中导入本地皮肤文件夹</p>
            </div>
          ) : (
            <div className="float-window-skin-grid">
              {championSkins.map((skin) => {
              const skinKey = `${skin.championId}-${skin.id}`
              const isApplyingThis =
                isApplying &&
                (applyingId === skinKey ||
                  !!skin.chromas?.some((c) => `${c.championId}-${c.id}` === applyingId))
              return (
                <div
                  key={skin.id}
                  className={`float-skin-card ${isSkinOrChromaApplied(skin) ? 'applied' : ''} ${isApplyingThis ? 'applying' : ''}`}
                  onClick={() => handleApplySkin(skin)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="float-skin-image-wrapper">
                    <ImageLoader
                      src={skin.image}
                      altSrc={skin.imageAlt}
                      altSrc2={skin.imageAlt2}
                      alt={skin.name}
                    />
                    {isApplyingThis && (
                      <div className="float-skin-applying-overlay">
                        <div className="float-window-spinner" />
                      </div>
                    )}
                    {isSkinOrChromaApplied(skin) && !isApplyingThis && (
                      <div className="float-skin-applied-badge" title="已应用">
                        <svg viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="10" fill="#c8aa6e"/>
                          <circle cx="12" cy="12" r="10" fill="none" stroke="#c8aa6e" strokeWidth="1.5"/>
                          <circle cx="12" cy="12" r="9.1" fill="none" stroke="#f0e6d2" strokeWidth="0.4" opacity="0.4"/>
                          <path d="M7 12.5l3 3 7-7" stroke="#f0ebe0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    )}
                    {/* 炫彩小圆点：悬在图片底部 */}
                    {skin.chromas && skin.chromas.length > 0 && (
                      <div className="float-chroma-row">
                        {skin.chromas
                          .filter((c) => c.colors?.length)
                          .map((chroma) => {
                            const chromaKey = `${chroma.championId}-${chroma.id}`
                            const isSelected = chromaKey === currentSkinId
                            const isApplyingChroma = isApplying && applyingId === chromaKey
                            return (
                              <div
                                key={chroma.id}
                                className={`float-chroma-dot ${isSelected ? 'selected' : ''} ${isApplyingChroma ? 'applying' : ''}`}
                                style={{
                                  background: `linear-gradient(to top right, ${chroma.colors?.join(', ')})`
                                }}
                                title={chroma.name}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleApplyChroma(chroma)
                                }}
                              />
                            )
                          })}
                      </div>
                    )}
                  </div>
                  <div className="float-skin-name">{skin.name}</div>
                </div>
              )
            })}
            </div>
          )}
        </div>
        {/* 横向布局左右箭头：固定在 wrap 两侧，不随滚动容器移动 */}
        {isHorizontal && (
          <>
            <button
              className={`float-scroll-btn float-scroll-left ${!canScrollLeft ? 'disabled' : ''}`}
              onClick={() => canScrollLeft && scrollByPage(-1)}
              disabled={!canScrollLeft}
              title="向左查看更多"
            >
              <span aria-hidden="true" />
            </button>
            <button
              className={`float-scroll-btn float-scroll-right ${!canScrollRight ? 'disabled' : ''}`}
              onClick={() => canScrollRight && scrollByPage(1)}
              disabled={!canScrollRight}
              title="向右查看更多"
            >
              <span aria-hidden="true" />
            </button>
          </>
        )}
      </div>

    </div>
  )
}
