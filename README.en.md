<h1 align="center">Xishi Tuotuo</h1>
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
<p align="center"><b>Plan your wedding together, as a family.</b><br />A collaborative wedding planner built with Vue 3, TypeScript, uni-app and WeChat Cloud Development.</p>
<p align="center"><a href="README.md">简体中文</a> · <b>English</b></p>
<p align="center"><a href="#features">Features</a> · <a href="#getting-started">Getting started</a> · <a href="#local-development">Local development</a> · <a href="#cloud-deployment">Cloud deployment</a></p>

## Features

| Feature | What it does |
| --- | --- |
| Wedding overview | Keep names, date and venue together; view the countdown and progress calculated from completed tasks divided by all tasks. |
| Family collaboration | Invite the couple and parents into one planning group to share information and arrangements. Each group plans one wedding. |
| Planning tasks | Add, assign and complete tasks, set due dates and work through preparation stages. |
| Supplies | Organize wedding items, quantities and preparation status. |
| Vendors | Keep contact details, quotes, discussion notes and booking status together. |
| Guests and replies | Maintain guest lists and party sizes, and collect attendance and accommodation needs through invitations. |
| Digital invitations | Add wedding details and a personal message, then share with guests. |
| Round-table seating | Arrange guests around visual round tables with 10 seats, 12 seats or a custom capacity, and check remaining seats. |
| Wedding-day timeline | Plan times, responsible people and notes for each part of the day. |
| Accommodation | Organize hotels, rooms and stays for guests travelling from elsewhere. |
| Data export | Export planning information for backups, printing and coordination. |

## Getting started

1. Create a wedding planning group and enter the couple's names, wedding date and venue.
2. Invite your partner and parents to maintain tasks and supplies together.
3. Organize vendors, guests and accommodation; share invitations and collect replies.
4. Choose table capacities, assign guests in the round-table view and prepare the wedding-day timeline.
5. Export information when needed for family members and on-site helpers.

## Local development

Use Node.js 20 or newer and WeChat DevTools. Frontend pages use Vue 3 single-file components and TypeScript, compiled to a WeChat mini program with the [official uni-app toolchain](https://uniapp.dcloud.net.cn/worktile/CLI.html).

```powershell
git clone https://github.com/JackieYangon/xishi-tuotuo.git
cd xishi-tuotuo
npm ci
if (!(Test-Path -LiteralPath .env.local)) { Copy-Item .env.example .env.local }
# Set your own WECHAT_APPID and CLOUD_ENV_ID in .env.local.
npm run build:mp-weixin
```

Import the repository root into WeChat DevTools. The generated `project.config.json` points to `dist/build/mp-weixin/` for the mini program and `cloudfunctions/` for cloud functions. Edit `.vue` pages under `src/pages/` and rebuild. Watch mode, `npm run dev:mp-weixin`, automatically switches to `dist/dev/mp-weixin/`; a production build restores the production directory. Reopen the DevTools project after switching modes. Do not edit or commit generated files in `dist/`.

Use the **full environment ID** shown in the cloud console for `CLOUD_ENV_ID`, not the environment's display name. Keep the AppID and environment ID in local configuration rather than shared source files. Never put an AppSecret, access token or service credential in the frontend, README or Git commits.

If another mini program owns the environment, its owner must **authorize this mini program in the cloud console first**. Then set the owner's AppID as `CLOUD_RESOURCE_APPID` in `.env.local`. Keep this mini program's AppID in `WECHAT_APPID`; do not swap the two. Leave `CLOUD_RESOURCE_APPID` blank when using this mini program's own environment; do not repeat the same AppID in both fields.

Run checks with:

```powershell
npm test
npm run type-check
npm run check
```

For source checks without a cloud connection, generate example configuration:

```powershell
node scripts/prepare-local-config.cjs --example
npm test
npm run type-check
npm run check
```

Example configuration disables cloud access. Run `npm run setup` again before connecting to a real environment.

## Cloud deployment

The project can use a shared cloud environment. Dedicated resource names and server-side identity checks isolate its wedding data.

| Resource | Project name |
| --- | --- |
| Cloud function | `xishiTuotuoApi` |
| Database collection | `xishi_tuotuo_groups` |
| Cloud storage prefix | `xishi-tuotuo/` |

1. Set this mini program's AppID and the full target environment ID in `.env.local`. For an environment shared by another mini program, complete the owner's authorization and set `CLOUD_RESOURCE_APPID`, then run `npm run setup`.
2. Create the `xishi_tuotuo_groups` collection in the target environment and set its permissions to **administrator-only read and write**. Clients access data through the cloud function, never directly.
3. In WeChat DevTools, right-click `cloudfunctions/xishiTuotuoApi` and select **Upload and deploy: install dependencies in the cloud**. Confirm the target environment. Deploy only this function, including its generated `local-config.json`.
4. Compile the mini program, create a group and invite collaborators to join using their own WeChat accounts.

The cloud function obtains identity from the WeChat runtime context and checks the mini program AppID and group membership. Client-supplied user identifiers are not trusted identities.

In a shared environment, create or update only this project's resources listed above. **Do not overwrite another mini program's functions, collections or files, or change environment-wide storage rules.** Files must use the dedicated `xishi-tuotuo/` prefix; any added file feature must have access rules appropriate to its intended audience.

## Configuration and versions

The `version` in `package.json` is the only version source. `npm run setup` generates the mini program's version module. After updating the version, run `npm run docs:badges` to synchronize both README version badges. Major upgrades, new features and fixes increment the major, minor and patch components respectively.

Edit `project.config.template.json` for shared project settings. The following local or DevTools-generated files are excluded from Git:

- `.env.local`
- `project.config.json` and `project.private.config.json`
- `src/config.local.json`, `src/version.json` and `src/manifest.json`
- `cloudfunctions/xishiTuotuoApi/local-config.json`

Run `npm run setup` again after changing the AppID, cloud environment, resource-owner AppID or version. Redeploy this project's cloud function when its configuration changes. Resource-sharing authorization does not change this project's dedicated collection, file prefix or member permissions, and does not require changes to environment-wide security rules.

## Project structure

```text
src/                                Vue 3 pages, TypeScript entry, services and styles
dist/                               Local build output (not committed)
cloudfunctions/xishiTuotuoApi/       Project cloud function and authorization
scripts/prepare-local-config.cjs     Local configuration and version generation
scripts/check.cjs                    Syntax, configuration and page checks
tests/                              Automated tests
project.config.template.json        Shared WeChat DevTools configuration template
.env.example                        Local configuration example
```

## License

This project is licensed under the [MIT License](LICENSE).
