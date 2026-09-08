/**
 * ┌───────────────────────────────────────────────────────────────────────────────┐
 * │ 皮肤文件的本地化管理：皮肤目录定位 / 导入校验 / 磁盘扫描。                     │
 * │ 单机化设计：不联网下载皮肤包，皮肤一律由用户从本地目录导入（.fantome/.zip）。  │
 * └───────────────────────────────────────────────────────────────────────────────┘
 */

import crypto from 'crypto'
import fs from 'fs-extra'
import path from 'path'

import {
  LOL_SKINS_LOCATION,
  LOL_SKINS_METADATA_LOCATION,
  LOL_SKINS_METADATA_FALLBACK
} from './constants'
import { getConfigValue, setConfigValue } from './config'

import {
  type Champion,
  type Skin,
  invalidateMetadataCache,
  listChampions,
  listSkins,
  normalizeName
} from './metadata'

// 缓存 getExistingSkins 结果，避免每次切换英雄都扫描磁盘
let cachedExistingSkins: Skin[] | null = null
let cachedExistingSkinsLocation: string | null = null

/**
 * 清除 getExistingSkins 缓存，在更换 skins 路径后调用。
 */
export function invalidateExistingSkinsCache(): void {
  cachedExistingSkins = null
  cachedExistingSkinsLocation = null
}

/**
 * 指纹同步：确保 userData 本地副本与内置文件内容一致。
 * 单机化设计：打包的 resources/skins_metadata.json 是权威数据源——应用升级后内置文件更新，
 * 与旧副本指纹不一致时覆盖之；一致（含首次缺失）则按需复制/跳过，保证老副本不"过期"。
 */
export async function downloadLolSkinsMetadata(): Promise<void> {
  if (!(await locationExists(LOL_SKINS_METADATA_FALLBACK))) return
  try {
    if (!(await isLocalMetadataInSync())) {
      await fs.copyFile(LOL_SKINS_METADATA_FALLBACK, LOL_SKINS_METADATA_LOCATION)
      invalidateMetadataCache() // 副本被替换，清掉可能已解析缓存的旧元数据
      console.log('内置元数据有更新，已同步到本地副本')
    }
  } catch (copyErr) {
    console.warn('同步内置元数据失败:', copyErr)
  }
}

/**
 * 本地副本与内置文件是否一致：先比大小快速排除，再对相同大小做 sha256 指纹比对。
 * 副本缺失或任一文件读取失败一律视为不一致，交给调用方按缺文件兜底。
 */
async function isLocalMetadataInSync(): Promise<boolean> {
  if (!(await locationExists(LOL_SKINS_METADATA_LOCATION))) return false
  try {
    const [bundledStat, localStat] = await Promise.all([
      fs.stat(LOL_SKINS_METADATA_FALLBACK),
      fs.stat(LOL_SKINS_METADATA_LOCATION)
    ])
    if (bundledStat.size !== localStat.size) return false
    const [bundled, local] = await Promise.all([
      fs.readFile(LOL_SKINS_METADATA_FALLBACK),
      fs.readFile(LOL_SKINS_METADATA_LOCATION)
    ])
    const hash = (data: Buffer): string => crypto.createHash('sha256').update(data).digest('hex')
    return hash(bundled) === hash(local)
  } catch {
    return false
  }
}

/**
 * 获取皮肤文件夹的实际位置
 * 如果用户配置了自定义路径，则使用配置的路径，否则使用默认位置
 */
export async function getSkinsLocation(): Promise<string> {
  const customPath = await getConfigValue('skinsPath')
  return typeof customPath === 'string' && customPath ? customPath : LOL_SKINS_LOCATION
}

/**
 * 检查文件或目录是否存在。
 * @param location 要检查的路径
 * @returns {Promise<boolean>} 是否存在
 */
async function locationExists(location: string): Promise<boolean> {
  return fs.pathExists(location)
}

/**
 * 检查 LOL 皮肤是否已就绪。
 * @returns {Promise<boolean>} 皮肤目录是否有效且含皮肤文件。
 */
export async function checkLolSkinsExist(): Promise<boolean> {
  const skinsLocation = await getSkinsLocation()
  // B 方案：须先导入成功（skinsAvailable=true），且目录真实包含皮肤文件才打钩
  if (!(await getConfigValue('skinsAvailable'))) return false
  return hasSkinFiles(skinsLocation)
}

/**
 * 轻量结构校验：目录存在且至少含一个符合 LOL-SKINS 结构的皮肤文件。
 * 标准结构：<skins>/<英雄目录>/<皮肤文件(.fantome/.zip)>，或顶层平铺的 .fantome 文件。
 * 注意：顶层 .zip 不算数——普通文件夹也常含任意压缩包，仅凭 zip 会把"选错的文件夹"误判为有效。
 */
async function hasSkinFiles(skinsPath: string): Promise<boolean> {
  try {
    if (!(await locationExists(skinsPath))) return false
    const entries = await fs.readdir(skinsPath, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const files = await fs.readdir(path.join(skinsPath, entry.name))
        if (files.some((f) => /\.(fantome|zip)$/i.test(f))) return true
      }
      // 顶层平铺的 .fantome（LOL-SKINS 专用格式，普通文件夹中不会出现）
      if (entry.isFile() && /\.fantome$/i.test(entry.name)) return true
    }
    return false
  } catch {
    return false
  }
}

/**
 * 校验本地皮肤目录是否有效：须包含符合 LOL-SKINS 结构的皮肤文件，
 * 且元数据可用时，一级子目录名还须匹配英雄名（含别名），进一步避免误判。
 */
async function validateSkinsPath(skinsPath: string): Promise<boolean> {
  try {
    if (!(await hasSkinFiles(skinsPath))) return false

    // 元数据就绪时用英雄名校验目录名；未就绪/离线时降级为纯结构校验
    const championNames = new Set<string>()
    try {
      for (const c of await listChampions()) {
        championNames.add(c.name)
        for (const alias of c.aliases ?? []) championNames.add(alias)
      }
    } catch {
      // 元数据不可用，结构校验已通过即可
      return true
    }

    const entries = await fs.readdir(skinsPath, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const files = await fs.readdir(path.join(skinsPath, entry.name))
        if (!files.some((f) => /\.(fantome|zip)$/i.test(f))) continue
        if (championNames.has(entry.name)) return true
      }
      // 顶层平铺的 .fantome（LOL-SKINS 专用格式，普通文件夹中不会出现）
      if (entry.isFile() && /\.fantome$/i.test(entry.name)) return true
    }
    return false
  } catch {
    return false
  }
}

/**
 * 使用本地 LOL-SKINS 文件（导入模式，替代联网下载）。
 * 保存用户选择的皮肤路径到配置并直接使用。
 * @param localSkinsPath 本地 skins 目录路径
 * @returns {Promise<void>} 操作完成。
 */
export async function useLocalLolSkins(localSkinsPath: string): Promise<void> {
  // 校验路径有效性：必须包含皮肤文件，否则"打钩成功但实际无效"
  if (!(await validateSkinsPath(localSkinsPath))) {
    // B 方案：选错路径 = 强制清空皮肤列表，须重新导入成功才能看到皮肤
    // 注意：选错的路径也写入 config，方便排错时确认用户实际选的目录
    await setConfigValue('skinsPath', localSkinsPath)
    await setConfigValue('skinsAvailable', false)
    throw new Error(
      '所选文件夹中未找到皮肤文件（.fantome / .zip），请确认选择的是 skins 目录。'
    )
  }
  // 保存用户选择的皮肤路径到配置
  await setConfigValue('skinsPath', localSkinsPath)
  await setConfigValue('skinsAvailable', true)

  // 指纹同步本地元数据（副本缺失或不一致时从内置资源补齐）
  await downloadLolSkinsMetadata()
}

/**
 * This function returns skins that have corresponding files on disk.
 * @returns {Promise<Skin[]>} the list of skins that exist on disk.
 */
/**
 * CDragon 元数据未收录的皮肤，但磁盘上可能已存在。
 * 每个条目对应一个已知的"额外皮肤"，字段：
 * - championName: 英雄中文名（用于匹配目录）
 * - id: 皮肤在 DDragon 中的编号，用于拼 splash URL
 * - name: 皮肤中文名（用于匹配文件名 + 界面显示）
 */
interface ExtraSkin {
  championName: string
  id: number
  name: string
  parentName: string
  imageUrl?: string
}

// EXTRA_SKINS 的顺序 = 浮窗里的展示顺序：同一父皮肤下有多个 extra 时，
// 按这里的先后依次排在其后，所以 86「联盟不朽 阿狸」必须写在 87「联盟不朽 阿狸 Ⅱ」之前。
// name 必须与磁盘上「专属文件名」对应（见下方单向包含匹配）：没有对应 .fantome 文件时卡片不显示。
const EXTRA_SKINS: ExtraSkin[] = [
  {
    championName: '虚空之女',
    id: 71,
    name: '联盟不朽 卡莎',
    parentName: '殿堂传奇 卡莎'
  },
  {
    championName: '虚空之女',
    id: 88,
    name: '联盟不朽 卡莎 Ⅱ',
    parentName: '殿堂传奇 卡莎',
    // 与 71 卡同一张官方原画（至强形态无独立 DDragon splash，恐龙社图源不可达）
    imageUrl: 'https://ddragon.leagueoflegends.com/cdn/img/champion/loading/Kaisa_71.jpg'
  },
  {
    championName: '九尾妖狐',
    id: 86,
    name: '联盟不朽 阿狸',
    parentName: '殿堂传奇 阿狸'
  },
  {
    championName: '九尾妖狐',
    id: 87,
    name: '联盟不朽 阿狸 Ⅱ',
    parentName: '殿堂传奇 阿狸',
    // 与 86 卡同一张 DDragon 原画（默认 splash 用 id 87 会 404）
    imageUrl: 'https://ddragon.leagueoflegends.com/cdn/img/champion/loading/Ahri_86.jpg'
  }
]

interface ExtraSkinResult {
  skin: Skin
  parentName: string
}

/**
 * 扫描 EXTRA_SKINS 配置中的皮肤：
 * 1. 查找对应英雄目录
 * 2. 模糊匹配 .fantome / .zip 文件
 * 3. 找到则返回 Skin 条目 + parentName（splash 用 DDragon 直链）
 */
async function getExtraSkins(
  skinsLocation: string,
  championByTitle: Map<string, Champion>
): Promise<ExtraSkinResult[]> {
  const result: ExtraSkinResult[] = []

  for (const extra of EXTRA_SKINS) {
    const champion = championByTitle.get(extra.championName)
    if (!champion) continue

    // 解析英雄目录名（可能用别名）
    const possibleDirs = [extra.championName, ...(champion?.aliases ?? [])]
    let championDir: string | null = null
    for (const dirName of possibleDirs) {
      const candidateDir = path.join(skinsLocation, dirName)
      if (await locationExists(candidateDir)) {
        championDir = candidateDir
        break
      }
    }
    if (!championDir) continue

    // 扫描顶层文件，模糊匹配皮肤名
    const files = await fs.readdir(championDir)
    const normalizedTarget = normalizeName(extra.name)
    let found = false
    for (const file of files) {
      if (!file.endsWith('.fantome') && !file.endsWith('.zip')) continue
      const fileNameWithoutExt = file.replace(/\.(zip|fantome)$/, '')
      const normalizedFile = normalizeName(fileNameWithoutExt)
      // 只认「文件名包含本 extra 名字」的匹配：名字更长的 extra（如「联盟不朽 阿狸 Ⅱ」）
      // 不会被「联盟不朽 阿狸」这类短名文件误匹配。没有专属文件时该卡不显示。
      if (normalizedFile.includes(normalizedTarget)) {
        found = true
        break
      }
    }
    if (!found) continue

    // DDragon 直链 splash
    const ddragonKey = champion.key // e.g. 'Kaisa'
    const splashUrl = `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${ddragonKey}_${extra.id}.jpg`

    result.push({
      skin: {
        id: extra.id * -1,
        championId: champion.id,
        championName: champion.name,
        name: extra.name,
        image: extra.imageUrl ?? splashUrl,
        imageAlt: champion.image,
        imageAlt2: champion.imageAlt,
        chromas: []
      },
      parentName: extra.parentName
    })
  }

  return result
}

export async function getExistingSkins(): Promise<Skin[]> {
  const skinsLocation = await getSkinsLocation()

  // B 方案：仅导入成功或下载完成（skinsAvailable=true）时才扫描皮肤，
  // 否则一律返回空列表，强制"导入成功才能看到皮肤"
  if (!(await getConfigValue('skinsAvailable'))) {
    cachedExistingSkins = []
    cachedExistingSkinsLocation = skinsLocation
    return []
  }

  // 如果路径和缓存都有效，直接返回缓存结果
  if (cachedExistingSkins && cachedExistingSkinsLocation === skinsLocation) {
    return cachedExistingSkins
  }

  if (!(await locationExists(skinsLocation))) {
    console.warn(`Skins location does not exist: ${skinsLocation}`)
    cachedExistingSkins = []
    cachedExistingSkinsLocation = skinsLocation
    return []
  }
  const skins = await listSkins()
  const existingSkins: Skin[] = []

  // Build champion title → champion map for finding aliases
  const champions = await listChampions()
  const championByTitle = new Map<string, Champion>()
  for (const c of champions) {
    championByTitle.set(c.name, c)
  }

  for (const skin of skins) {
    // Try current championName first, then aliases as fallback
    const champion = championByTitle.get(skin.championName)
    const possibleDirs = [skin.championName]
    if (champion) {
      possibleDirs.push(...champion.aliases)
    }

    let championDir: string | null = null
    for (const dirName of possibleDirs) {
      const candidateDir = path.join(skinsLocation, dirName)
      if (await locationExists(candidateDir)) {
        championDir = candidateDir
        break
      }
    }
    if (!championDir) continue

    const files = await fs.readdir(championDir)
    const normalizedSkinName = skin.name.toLowerCase().replace(/[:\s'"]/g, '').replace(/\u3000/g, '')

    for (const file of files) {
      const fileNameWithoutExt = file.replace(/\.(zip|fantome)$/, '')
      const normalizedFileName = fileNameWithoutExt.toLowerCase().replace(/[:\s'"]/g, '').replace(/\u3000/g, '')
      if (normalizedFileName.includes(normalizedSkinName) || normalizedSkinName.includes(normalizedFileName)) {
        existingSkins.push(skin)
        break
      }
    }
  }

  // 将 CDragon 元数据未收录的额外皮肤插入到对应父皮肤后面
  const extraSkins = await getExtraSkins(skinsLocation, championByTitle)
  if (extraSkins.length > 0) {
    // EXTRA_SKINS 的顺序即浮窗里的展示顺序：每个 extra 插到父皮肤之后，
    // 同一父皮肤下有多个 extra 时，用「已插入数量」作偏移依次排列，保证互不颠倒；
    // 父皮肤不在列表（对应文件缺失）时按序 push 到末尾，顺序同样保持。
    const extraCountAfterParent = new Map<string, number>()
    for (const { skin, parentName } of extraSkins) {
      const groupKey = `${skin.championId}:${parentName}`
      const insertAt = existingSkins.findIndex(
        (s) => s.championId === skin.championId && s.name === parentName
      )
      if (insertAt !== -1) {
        const offset = extraCountAfterParent.get(groupKey) ?? 0
        existingSkins.splice(insertAt + 1 + offset, 0, skin)
        extraCountAfterParent.set(groupKey, offset + 1)
      } else {
        existingSkins.push(skin)
      }
    }
    console.log(
      `[ExtraSkins] Added ${extraSkins.length} extra skin(s):`,
      extraSkins.map((s) => s.skin.name)
    )
  }

  cachedExistingSkins = existingSkins
  cachedExistingSkinsLocation = skinsLocation
  return existingSkins
}
