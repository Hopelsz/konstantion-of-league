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


## 开发

环境要求：Node.js、[pnpm](https://pnpm.io)（仓库已锁定 `pnpm@10`）

```bash
git clone https://github.com/Hopelsz/league-skins-tool.git
cd league-skins-tool

# 安装依赖
pnpm install

# 开发模式（带热更新）
pnpm dev

# 类型检查
pnpm typecheck

# 打包 Windows 安装程序
pnpm build:win
```

> 开发调试小技巧：dev 模式下启动约 1 秒后会自动弹出一个悬浮窗用于预览布局，设置环境变量 `LEAGUE_SKINS_DEBUG_FLOAT=0` 可关闭。


## 更新内置皮肤元数据

程序离线运行，识别新英雄/新皮肤靠打包在内的 `resources/skins_metadata.json`，它**不会**随英雄联盟版本自动更新。建议每逢游戏大版本更新跑一次：

```bash
pnpm update:metadata
```

脚本会从 CommunityDragon（简体中文档位）下载最新 `skins.json`，校验结构无误后覆盖 `resources/skins_metadata.json`。随后随下一次打包发版；老用户升级新版本时，程序会通过内置文件指纹自动覆盖其本地旧副本，无需手动清理。


## 免责声明

本项目未获得 Riot Games 的认可，也不代表 Riot Games 或其任何关联公司的观点或意见。英雄联盟及所有相关资产均为 Riot Games, Inc. 的商标或注册商标。

此外，无法确定本软件是否违反 Riot Games 的服务条款。使用本软件可能违反其政策，也无法保证其是否会被检测到或导致封号。使用本软件的风险由您自行承担，作者对任何后果概不负责，包括但不限于 Riot Games 施加的账号处罚、封禁或限制。
