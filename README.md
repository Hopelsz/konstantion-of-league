# Konstantion of League

一款基于 [cslol-manager](https://github.com/LeagueToolkit/cslol-manager) 的《英雄联盟》Windows 换肤工具。程序无主界面，安装后常驻系统托盘，进入游戏选人阶段时自动弹出悬浮窗，点选即换肤。

<p align="center"><b><font size="5" color="#e74c3c">⚠️ 本工具不自带任何皮肤文件，请自行准备皮肤包（.fantome / .zip）！</font></b></p>

## 使用前提

- Windows 系统
- 本机已安装并登录《英雄联盟》客户端
- 已准备与你所用游戏版本兼容的皮肤文件

## 快速上手

1. 安装后首次启动会弹出「配置向导」，按提示完成两步配置：

   - **游戏路径**：选择 LOL 安装目录根目录下的 `Game/League of Legends.exe`，工具会自动校验有效性。
   - **本地皮肤目录**：选择存放皮肤包的文件夹，工具会校验其中是否存在可用的皮肤文件。

2. 点击「隐藏到后台，开始使用」，程序转入托盘常驻。

3. 排队进入对局，在选人阶段选定英雄后，悬浮窗会自动出现——点选想要使用的皮肤即可。之后每次选到同一英雄都会自动应用你上次的选择。

> 已完成配置后，程序启动即直接后台待命，不再弹出向导窗口。之后可通过托盘菜单「配置游戏与皮肤」或双击托盘图标随时重新打开配置窗口。


## 皮肤目录支持两种排列格式

配置「本地皮肤目录」时，下列两种都能识别（同一目录下混放也可以）：

**1. 按名称排列（LOL-SKINS 常见格式）**

```
<皮肤目录>/九尾妖狐/殿堂传奇 阿狸.fantome
<皮肤目录>/九尾妖狐/chromas/29.fantome
```

按英雄中文名（含别名）+ 皮肤名模糊匹配。

**2. 按数字 ID 排列（如 [LeagueSkins](https://github.com/Alban1911/LeagueSkins)）**

```
<皮肤目录>/103/103015/103015.fantome      ← 皮肤：英雄id/皮肤id
<皮肤目录>/103/103015/1014/1014.fantome   ← 炫彩：挂在父皮肤目录下
```

完整皮肤 ID = 英雄 ID × 1000 + 皮肤序号，程序按 ID 精确定位。

> 使用 LeagueSkins 仓库时可以直接选仓库根目录，程序会自动下钻到其中的 `skins` 文件夹。


## 开发

环境要求：Node.js、[pnpm](https://pnpm.io)（仓库已锁定 `pnpm@10`）

```bash
git clone https://github.com/Hopelsz/konstantion-of-league.git
cd konstantion-of-league

# 安装依赖
pnpm install

# 开发模式（带热更新）
pnpm dev

# 类型检查
pnpm typecheck

# 打包 Windows 安装程序
pnpm build:win
```

> 皮肤元数据 `resources/skins_metadata.json`（约 6MB）**不在 Git 仓库中**（见 `.gitignore`），克隆后首次 `pnpm dev` / `pnpm build:win` 需联网，构建前置脚本会自动从 CommunityDragon 下载；此后即可离线构建。也可手动执行 `pnpm update:metadata` 获取最新版。

> 开发调试小技巧：dev 模式下启动约 1 秒后会自动弹出一个悬浮窗用于预览布局，设置环境变量 `LEAGUE_SKINS_DEBUG_FLOAT=0` 可关闭。


## 更新内置皮肤元数据

程序识别新英雄/新皮肤靠打包在内的 `resources/skins_metadata.json`，它**不会**随英雄联盟版本自动更新。建议每逢游戏大版本更新跑一次：

```bash
pnpm update:metadata
```

脚本会从 CommunityDragon（简体中文档位）下载最新 `skins.json`，校验结构无误后覆盖 `resources/skins_metadata.json`。随后随下一次打包发版（`pnpm build` 前置的 `ensure:metadata` 仅在文件缺失时补下，不会自动刷新）。

终端用户侧无需关心以上内容：应用配置窗口顶栏有「更新皮肤元数据」按钮，游戏出新版本后联网点一下即可，不必升级应用；程序通过对比游戏版本号判断是否已有新数据，已是最新时按钮不可点击。


## 免责声明

本项目未获得 Riot Games 的认可，也不代表 Riot Games 或其任何关联公司的观点或意见。英雄联盟及所有相关资产均为 Riot Games, Inc. 的商标或注册商标。

此外，无法确定本软件是否违反 Riot Games 的服务条款。使用本软件可能违反其政策，也无法保证其是否会被检测到或导致封号。使用本软件的风险由您自行承担，作者对任何后果概不负责，包括但不限于 Riot Games 施加的账号处罚、封禁或限制。
