# 开发工作流

更新：2026-11-11。

1. 阅读 AGENTS.md 和项目记忆，检查 Git 状态，保留用户修改。
2. 从 `.env.example` 准备忽略的 `.env.local`；配置 WECHAT_APPID、CLOUD_ENV_ID，跨小程序共享时再填 CLOUD_RESOURCE_APPID。
3. `npm run setup` 生成本地配置。仅静态检查可用 `node scripts/prepare-local-config.cjs --example`，恢复真实云环境前必须重新 setup。
4. 修改后执行 `npm test`、`npm run check`，有页面修改时使用微信开发者工具编译 WXML/WXSS 并检查实际界面。
5. 编译截图、临时工具、导出样本放 `.artifacts/` 或 `.tools/`；不提交依赖、日志、缓存及本地部署标识。
6. 检查暂存差异和敏感信息，使用英文提交消息，推送 origin/main。SSH 网络失败时可以用 Git 单次 HTTPS URL 重写访问相同仓库，保留 origin 的用户指定 SSH 地址；禁止强推。
7. 云端部署只操作本项目函数与集合。先检查目标环境和同名资源，部署不等于提交微信审核。

版本：重大升级增加主版本，功能新增增加次版本，修复增加修订号；次版本和修订号均 0–99，数值版本为 major × 10000 + minor × 100 + patch。
