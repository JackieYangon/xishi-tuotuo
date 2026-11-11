# 项目协作约定

- 产品名称：喜事妥妥。默认中文；Git 提交信息全部使用英文。
- 修改前检查工作区，保留用户修改。验证通过后自动提交并推送 origin；禁止强推。
- 固定远程仓库为 git@github.com:JackieYangon/xishi-tuotuo.git，所有日常提交推送 main 分支；保留已有 MIT 协议和历史。
- README.md 为中文入口，README.en.md 为对应英文版，顶部互链；只包含用户功能、使用及部署说明。
- package.json 的 version 是唯一版本来源，使用主.次.修订版本；重大升级、新增功能、修复分别递增相应位。
- AppID、云环境 ID、凭据及本地配置不得提交。客户端不得持有 AppSecret 或服务密钥。
- 共享云环境只访问本项目 xishi_tuotuo_ 集合、xishiTuotuoApi 云函数和 xishi-tuotuo/ 存储目录；不得修改其他项目资源或全局安全规则。
- 云端以微信上下文验证身份和群组权限，数据库仅云函数访问。不要信任客户端传入的身份字段。
- 内部进度和验证记录只在本地 .codex/project-memory 保存；整个 .codex/ 必须由 .gitignore 忽略，不跟踪、不提交，也不能放进面向用户的 README。
- 普通 Git 推送不代表发布微信审核、GitHub Release 或部署云函数；以用户当前授权范围为准。
- 当前范围：婚礼档案、事项进度、家庭群组协作、物品、商家、宾客、请柬、回执、圆桌排座、当天流程、住宿、导出。
- 不实现预算、礼金、婚车、多宴席、灵感、共享相册。每个群组仅筹备一场婚礼。

- 前端统一使用 Vue 3 单文件组件与 TypeScript，经 uni-app 编译为微信小程序；不得恢复手写原生页面或引入其他前端框架。
- 两份 README 保留相同的版本、MIT、WeChat Mini Program、uni-app、Vue 3、TypeScript 徽章；版本取自 package.json。
- 每次完成代码迭代时按变更类型自动递增版本，并同步 package-lock.json、两份 README 徽章及本地生成版本；已发布的标签不得覆盖。
