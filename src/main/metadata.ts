/**
 * ┌───────────────────────────────────────────────────────────────────────────────┐
 * │ This module handles the processing and distribution of champion and skin      │
 * │ metadata from a stored json downloaded from community data-dragon.            │
 * └───────────────────────────────────────────────────────────────────────────────┘
 */

import fs from 'fs/promises'
import { LOL_SKINS_METADATA_LOCATION, LOL_SKINS_METADATA_FALLBACK } from './constants'
import { getChampionInfo } from './championData'

export type Champion = {
  id: number
  name: string
  alias: string
  key: string
  nicknames: string[]
  roles: string[]
  aliases: string[]
  image: string
  imageAlt: string // 备用原画URL（ddragon兜底）
  imageAlt2: string // 第三备用（CommunityDragon兜底）
}

export type Chroma = {
  id: number
  championId: number
  championName: string
  name: string
  colors: string[]
}

export type Skin = {
  id: number
  championId: number
  championName: string
  name: string
  image: string
  imageAlt: string // 备用URL（ddragon兜底）
  imageAlt2: string // 第三备用（CommunityDragon兜底）
  chromas: Chroma[]
}

type SkinRaw = {
  id: number
  name: string
  splashPath: string
  chromas?: { id: number; name: string; colors: string[] }[]
}

// ======================== 缓存 ========================
// 避免每次都重新解析元数据 JSON，大幅提升弹窗响应速度

let cachedChampions: Champion[] | null = null
let cachedSkins: Skin[] | null = null
let cachedRawData: SkinRaw[] | null = null

/**
 * 规范化名称用于模糊匹配：小写 + 去除特殊字符、空格和全角空格。
 */
export function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[:\s'"\u3000]/g, '')
}

/**
 * 清除缓存，在重新下载元数据后调用。
 */
export function invalidateMetadataCache(): void {
  cachedChampions = null
  cachedSkins = null
  cachedRawData = null
}

/**
 * This function extracts the champion key from a splash art path.
 * @param splashPath  the splash art path to extract the champion key from.
 * @returns the champion key or null if not found.
 */
function getChampionKeyFromSplashArt(splashPath: string): string | null {
  const match = splashPath.match(/Characters\/([^/]+)/)
  if (match === null) return null

  const key = match[1]

  return key === 'KhaZix' ? 'Khazix' : key
}

async function loadSkinData(): Promise<SkinRaw[]> {
  if (cachedRawData) return cachedRawData

  const tryLoad = async (filePath: string): Promise<SkinRaw[] | null> => {
    try {
      await fs.access(filePath)
      const content = await fs.readFile(filePath, 'utf-8')
      cachedRawData = Object.values(JSON.parse(content)) as SkinRaw[]
      return cachedRawData
    } catch {
      return null
    }
  }

  // 优先读取用户数据目录中的本地副本（启动时由 downloadLolSkinsMetadata 指纹同步，与内置一致）
  const result = await tryLoad(LOL_SKINS_METADATA_LOCATION)
  if (result) return result

  // 回退到内置的兜底元数据文件
  const fallback = await tryLoad(LOL_SKINS_METADATA_FALLBACK)
  if (fallback) return fallback

  return []
}

/**
 * This function extracts the champion ID and skin ID from a skin ID.
 * @param skinId the skin ID to extract from.
 * @returns the champion ID and skin ID.
 */
export function getChampSkinIdFromSkinId(skinId: number): { championId: number; skinId: number } {
  const paddedId = String(skinId).padStart(6, '0')
  return {
    championId: Number(paddedId.slice(0, 3)),
    skinId: Number(paddedId.slice(3))
  }
}

/**
 * This function lists all champions based on community data dragon stored file.
 * @returns {Promise<Champion[]>} a list of champions.
 */
export async function listChampions(): Promise<Champion[]> {
  if (cachedChampions) return cachedChampions

  const rawSkins = await loadSkinData()
  const championsMap = new Map<number, Champion>()

  for (const skin of rawSkins) {
    const { championId } = getChampSkinIdFromSkinId(skin.id)
    if (championsMap.has(championId)) continue

    const championKey = getChampionKeyFromSplashArt(skin.splashPath) ?? ''
    const info = getChampionInfo(championKey)
    const defaultSkinId = championId * 1000 // 默认皮肤ID

    // 腾讯CDN国内快（老英雄都有，部分新英雄可能404），ddragon + CommunityDragon兜底
    championsMap.set(championId, {
      id: championId,
      name: info?.title || skin.name,
      alias: info?.name || '',
      key: championKey,
      nicknames: info?.nicknames ?? [],
      roles: info?.roles ?? [],
      aliases: info?.aliases ?? [],
      image: `https://game.gtimg.cn/images/lol/act/img/skinloading/${defaultSkinId}.jpg`,
      imageAlt: `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${championKey}_0.jpg`,
      imageAlt2: `https://raw.communitydragon.org/latest/game/assets/characters/${championKey.toLowerCase()}/skins/base/splash.png`
    })
  }

  cachedChampions = Array.from(championsMap.values())
  return cachedChampions
}

/**
 * This function lists all skins based on community data dragon stored file.
 * @returns {Promise<Skin[]>} a list of skins.
 */
export async function listSkins(): Promise<Skin[]> {
  if (cachedSkins) return cachedSkins

  const rawSkins = await loadSkinData()
  const champions = await listChampions()
  const championsById = new Map(champions.map((c) => [c.id, c]))
  const skins: Skin[] = []

  for (const rawSkin of rawSkins) {
    const { championId, skinId } = getChampSkinIdFromSkinId(rawSkin.id)
    const champion = championsById.get(championId)
    if (!champion) continue

    // 腾讯CDN国内快，部分新英雄皮肤可能404（此时前端ImageLoader并发尝试兜底URL）
    skins.push({
      id: skinId,
      championId,
      championName: champion.name,
      name: rawSkin.name,
      image: `https://game.gtimg.cn/images/lol/act/img/skinloading/${rawSkin.id}.jpg`,
      imageAlt: `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${champion.key}_${skinId}.jpg`,
      imageAlt2: `https://raw.communitydragon.org/latest/game/assets/characters/${champion.key.toLowerCase()}/skins/skin${skinId}/splash.png`,
      chromas: (rawSkin.chromas ?? []).map((chroma) => ({
        id: getChampSkinIdFromSkinId(chroma.id).skinId,
        championId,
        championName: champion.name,
        name: chroma.name || rawSkin.name,
        colors: chroma.colors
      }))
    })
  }

  cachedSkins = skins
  return cachedSkins
}
