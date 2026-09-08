#!/usr/bin/env node
/**
 * 更新内置皮肤元数据 resources/skins_metadata.json（离线兜底数据源）。
 * 用法：pnpm update:metadata
 *
 * 数据源：CommunityDragon 简体中文档位 skins.json，随游戏版本持续更新，
 * 建议每逢《英雄联盟》大版本更新后跑一次，再打包发版。
 *
 * 安全设计：先下载到内存并做结构冒烟校验，通过后才覆盖本地文件，
 * 避免把错误页/半截响应写坏现有数据（校验失败时保留原文件并退出非 0）。
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const SOURCE_URL =
  'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/zh_cn/v1/skins.json'
const TARGET_FILE = fileURLToPath(new URL('../resources/skins_metadata.json', import.meta.url))

/**
 * 结构与运行时消费字段的最小校验：顶层为 {皮肤id: {id, name, splashPath, ...}}。
 * @param {string} text 下载的原始 JSON 文本
 * @returns {number} 校验通过时的皮肤条目数
 */
function assertPlausible(text) {
  const data = JSON.parse(text)
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('顶层不是按皮肤 id 索引的对象，疑似数据源结构变化')
  }
  const entries = Object.values(data)
  if (entries.length === 0) throw new Error('解析结果为空，疑似下载到异常内容')
  const first = entries[0]
  if (
    typeof first?.id !== 'number' ||
    typeof first?.name !== 'string' ||
    typeof first?.splashPath !== 'string'
  ) {
    throw new Error('条目缺少 id/name/splashPath 字段，疑似数据源结构变化')
  }
  return entries.length
}

try {
  const response = await fetch(SOURCE_URL, { redirect: 'follow' })
  if (!response.ok) {
    throw new Error(`下载失败: HTTP ${response.status} ${response.statusText}`)
  }
  const text = await response.text()
  const newCount = assertPlausible(text)

  const oldText = await readFile(TARGET_FILE, 'utf-8').catch(() => '')
  if (oldText === text) {
    console.log('本地元数据已是最新（与 CDragon 一致），无需更新。')
  } else {
    const oldCount = oldText ? Object.keys(JSON.parse(oldText)).length : 0
    await writeFile(TARGET_FILE, text, 'utf-8')
    console.log(`已更新 resources/skins_metadata.json：${oldCount} → ${newCount} 个皮肤条目。`)
    if (oldCount > 0 && newCount < oldCount * 0.9) {
      console.warn('警告：条目数明显减少，请人工核对是否拉到了异常版本。')
    }
  }
} catch (err) {
  console.error(`[update-metadata] 失败，未改动本地文件：${err.message}`)
  process.exit(1)
}
