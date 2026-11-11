<h1 align="center">喜事妥妥</h1>
<!-- badges:start -->
<p align="center">
  <img alt="version 0.2.0" src="https://img.shields.io/badge/version-0.2.0-00866a?style=flat-square" />
  <a href="LICENSE"><img alt="license MIT" src="https://img.shields.io/badge/license-MIT-0088cc?style=flat-square" /></a>
  <img alt="WeChat Mini Program" src="https://img.shields.io/badge/WeChat-Mini_Program-07c160?style=flat-square&amp;logo=wechat&amp;logoColor=white" />
  <a href="https://uniapp.dcloud.net.cn/"><img alt="framework uni-app" src="https://img.shields.io/badge/framework-uni--app-2b9939?style=flat-square" /></a>
  <a href="https://vuejs.org/"><img alt="Vue 3" src="https://img.shields.io/badge/Vue-3-42b883?style=flat-square&amp;logo=vuedotjs&amp;logoColor=white" /></a>
  <a href="https://www.typescriptlang.org/"><img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178c6?style=flat-square&amp;logo=typescript&amp;logoColor=white" /></a>
</p>
<!-- badges:end -->
<p align="center"><b>一家人，把婚礼安排妥当。</b><br />基于 Vue 3、TypeScript、uni-app 与微信云开发的家庭协作备婚工具。</p>
<p align="center"><b>简体中文</b> · <a href="README.en.md">English</a></p>
<p align="center"><a href="#主要功能">功能介绍</a> · <a href="#开始使用">开始使用</a> · <a href="#本地开发">本地开发</a> · <a href="#云开发部署">云开发部署</a></p>

## 主要功能

| 功能 | 用途 |
| --- | --- |
| 婚礼首页 | 管理新人、婚期和地点，查看倒计时与筹备进度；进度按已完成事项占全部事项的比例计算。 |
| 家庭协作 | 新人和父母加入同一个筹备群组，共享婚礼资料、事项及安排；每个群组筹备一场婚礼。 |
| 筹备事项 | 添加、分配和完成事项，记录截止日期，按准备阶段推进。 |
| 物品清单 | 整理婚礼用品、数量及准备状态。 |
| 商家记录 | 集中保存商家联系方式、报价、沟通备注和预订状态。 |
| 宾客与回执 | 整理亲友名单和同行人数，通过请柬收集出席及住宿需求。 |
| 电子请柬 | 填写婚礼信息与邀请语，分享给亲友。 |
| 圆桌排座 | 用模拟圆桌查看座位，支持 10 人桌、12 人桌及自定义容量，安排宾客并检查余位。 |
| 当天流程 | 按时间整理各个环节、负责人和注意事项。 |
| 住宿安排 | 记录外地亲友的酒店、房间和入住安排。 |
| 数据导出 | 导出筹备资料，方便备份、打印及交给协作人员。 |

## 开始使用

1. 创建婚礼筹备群组，填写新人姓名、婚期和场地。
2. 邀请另一半与父母加入，共同维护事项和物品清单。
3. 整理商家、宾客和住宿信息，将请柬分享给亲友并收集回执。
4. 设置每桌人数，在圆桌视图安排宾客，补充婚礼当天流程。
5. 根据需要导出资料，让家人和现场工作人员查阅。

## 本地开发

需要 Node.js 20 或更高版本，以及微信开发者工具。前端页面使用 Vue 3 单文件组件和 TypeScript，通过 [uni-app 官方工具链](https://uniapp.dcloud.net.cn/worktile/CLI.html) 编译为微信小程序。

```powershell
git clone https://github.com/JackieYangon/xishi-tuotuo.git
cd xishi-tuotuo
npm ci
if (!(Test-Path -LiteralPath .env.local)) { Copy-Item .env.example .env.local }
# 在 .env.local 填写自己的 WECHAT_APPID 和 CLOUD_ENV_ID
npm run build:mp-weixin
```

用微信开发者工具导入仓库根目录。生成的 `project.config.json` 将小程序目录指向 `dist/build/mp-weixin/`，云函数目录指向 `cloudfunctions/`。编辑 `src/pages/` 下的 `.vue` 页面后重新构建。持续开发运行 `npm run dev:mp-weixin`，会自动切换到 `dist/dev/mp-weixin/`；生产构建会恢复生产目录。切换模式后重新打开开发者工具项目。不要编辑或提交 `dist/` 中的编译结果。

`CLOUD_ENV_ID` 必须填写云开发控制台显示的**完整环境 ID**，不能填写环境昵称。AppID 和环境 ID 只存放于本地配置，不写入共享源文件。不要在前端、README 或提交中放入 AppSecret、访问令牌和服务密钥。

如果云环境属于另一个小程序，先由**资源方在云开发控制台授权本小程序访问**，再将资源方 AppID 填入 `.env.local` 的 `CLOUD_RESOURCE_APPID`。本小程序仍填写在 `WECHAT_APPID`，不要交换两者。使用本小程序自己的环境时，`CLOUD_RESOURCE_APPID` 留空；同一个 AppID 不需要填写两次。

检查命令：

```powershell
npm test
npm run type-check
npm run check
```

仅进行源码检查、不连接云端时，可以生成示例配置：

```powershell
node scripts/prepare-local-config.cjs --example
npm test
npm run type-check
npm run check
```

示例配置禁用云访问；连接真实环境前重新执行 `npm run setup`。

## 云开发部署

本项目可以使用共享云开发环境，通过独立资源命名与云端身份校验隔离婚礼数据。

| 资源 | 本项目名称 |
| --- | --- |
| 云函数 | `xishiTuotuoApi` |
| 数据库集合 | `xishi_tuotuo_groups` |
| 云存储目录前缀 | `xishi-tuotuo/` |

1. 在 `.env.local` 填入本小程序的 AppID 和目标完整环境 ID。跨小程序共享环境时，先完成资源方授权并填写 `CLOUD_RESOURCE_APPID`，然后运行 `npm run setup`。
2. 在目标环境创建 `xishi_tuotuo_groups` 集合，权限设为**仅管理员可读写**。客户端通过云函数操作数据，不直接读写集合。
3. 在微信开发者工具中，右键 `cloudfunctions/xishiTuotuoApi`，选择**上传并部署：云端安装依赖**，确认目标环境。仅部署这个函数，并包含本地生成的 `local-config.json`。
4. 编译小程序，创建群组并邀请协作成员，在各自微信账号下使用。

云函数从微信运行上下文取得身份，并核对本小程序 AppID 和群组成员权限。请勿将客户端传入的用户标识当作可信身份。

共享环境中，只创建或更新上表列出的本项目资源。**不覆盖其他小程序的函数、集合和文件，不修改全环境存储安全规则。** 文件需要使用 `xishi-tuotuo/` 独立路径；新增文件能力时同时配置与其访问范围相符的规则。

## 配置与版本

`package.json` 的 `version` 是唯一版本来源；`npm run setup` 自动生成小程序版本模块。升级版本后运行 `npm run docs:badges`，同步两个 README 的版本徽章。版本采用主版本、次版本、修订号：重大升级、新增功能、修复分别递增对应位置。

共享项目设置修改 `project.config.template.json`。以下文件由本地生成或由开发者工具维护，不提交 Git：

- `.env.local`
- `project.config.json`、`project.private.config.json`
- `src/config.local.json`、`src/version.json`、`src/manifest.json`
- `cloudfunctions/xishiTuotuoApi/local-config.json`

更换 AppID、云环境、资源方 AppID 或版本后重新运行 `npm run setup`；云函数配置变化后，重新部署本项目云函数。资源共享授权不改变本项目专用集合、文件目录和成员权限，也不需要修改全环境安全规则。

## 项目结构

```text
src/                                Vue 3 页面、TypeScript 入口、服务和样式
dist/                               本地编译产物（不提交）
cloudfunctions/xishiTuotuoApi/       本项目云函数与权限校验
scripts/prepare-local-config.cjs     本地配置及版本生成
scripts/check.cjs                    语法、配置及页面完整性检查
tests/                              自动化测试
project.config.template.json        可共享的开发者工具配置模板
.env.example                        本地配置示例
```

## 许可证

本项目采用 [MIT 许可证](LICENSE)。
