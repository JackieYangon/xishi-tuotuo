'use strict'

const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const args = process.argv.slice(2)
if (args.length > 1 || (args.length === 1 && !['--example', '--dev'].includes(args[0]))) {
  throw new Error('Usage: node scripts/prepare-local-config.cjs [--example | --dev]')
}
const example = args.includes('--example')
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const parts = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.exec(version || '')
if (!parts) throw new Error('package.json version must be a semantic version')
const [major, minor, patch] = parts.slice(1, 4).map(Number)
const versionCode = major * 10000 + minor * 100 + patch
if (minor > 99 || patch > 99 || !Number.isSafeInteger(versionCode) || versionCode > 2100000000) {
  throw new Error('package.json version cannot be represented as a numeric versionCode')
}

function readLocalEnv() {
  const filename = path.join(root, '.env.local')
  if (!fs.existsSync(filename)) {
    throw new Error('Missing .env.local. Copy .env.example to .env.local and set WECHAT_APPID and CLOUD_ENV_ID. Use --example only for local checks.')
  }
  const values = {}
  const content = fs.readFileSync(filename, 'utf8').replace(/^\uFEFF/, '')
  for (const [index, source] of content.split(/\r?\n/).entries()) {
    const line = source.trim()
    if (!line || line.startsWith('#')) continue
    const match = /^(WECHAT_APPID|CLOUD_ENV_ID|CLOUD_RESOURCE_APPID)\s*=\s*(.*)$/.exec(line)
    if (!match) throw new Error(`Unsupported configuration at .env.local line ${index + 1}`)
    if (Object.prototype.hasOwnProperty.call(values, match[1])) {
      throw new Error(`Duplicate configuration key: ${match[1]}`)
    }
    let value = match[2].trim()
    if (/^['"]/.test(value)) {
      const quote = value[0]
      if (!value.endsWith(quote) || value.length < 2) throw new Error(`Invalid quoted value at .env.local line ${index + 1}`)
      value = value.slice(1, -1)
    } else {
      value = value.replace(/\s+#.*$/, '').trim()
    }
    values[match[1]] = value
  }
  return values
}

const values = example ? {} : readLocalEnv()
const appid = example ? 'touristappid' : (process.env.WECHAT_APPID ?? values.WECHAT_APPID ?? '').trim()
const envId = example ? '' : (process.env.CLOUD_ENV_ID ?? values.CLOUD_ENV_ID ?? '').trim()
const resourceAppid = example ? '' : (process.env.CLOUD_RESOURCE_APPID ?? values.CLOUD_RESOURCE_APPID ?? '').trim()
if (!example && !/^wx[0-9a-f]{16}$/.test(appid)) {
  throw new Error('WECHAT_APPID must be a valid WeChat mini program AppID')
}
if (!example && (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,127}$/.test(envId) || !envId.includes('-'))) {
  throw new Error('CLOUD_ENV_ID must be the full environment ID from the cloud console, not a display name')
}
if (resourceAppid && !/^wx[0-9a-f]{16}$/.test(resourceAppid)) {
  throw new Error('CLOUD_RESOURCE_APPID must be a valid resource-owner mini program AppID, or left blank')
}
if (resourceAppid && resourceAppid === appid) {
  throw new Error('CLOUD_RESOURCE_APPID must differ from WECHAT_APPID. Leave it blank when using this mini program\'s own environment')
}
const template = JSON.parse(fs.readFileSync(path.join(root, 'project.config.template.json'), 'utf8'))
const projectPath = path.join(root, 'project.config.json')
const previous = fs.existsSync(projectPath) ? JSON.parse(fs.readFileSync(projectPath, 'utf8').replace(/^\uFEFF/, '')) : {}
const project = {
  ...previous,
  ...template,
  miniprogramRoot: args.includes('--dev') ? 'dist/dev/mp-weixin/' : template.miniprogramRoot,
  setting: { ...(previous.setting || {}), ...template.setting },
  appid,
}
const json = (value) => JSON.stringify(value, null, 2) + '\n'
const generated = '// Generated locally by scripts/prepare-local-config.cjs. Do not commit.\n'
const writes = [
  ['project.config.json', json(project)],
  ['src/manifest.json', json({ name: '喜事妥妥', appid: '', versionName: version, versionCode, uniStatistics: { enable: false }, vueVersion: '3', 'mp-weixin': { appid, setting: { urlCheck: true }, usingComponents: true, permission: { 'scope.userLocation': { desc: '用于选择婚礼场地，方便亲友导航赴宴' } }, requiredPrivateInfos: ['chooseLocation'], lazyCodeLoading: 'requiredComponents' } })],
  ['src/config.local.json', json({ envId, resourceAppid, functionName: 'xishiTuotuoApi' })],
  ['cloudfunctions/xishiTuotuoApi/local-config.json', json({ allowedAppId: example ? '' : appid })],
  ['src/version.json', json({ version, versionCode })],
]

// Validate all input before replacing generated files; each rename keeps a complete file.
const staged = []
try {
  for (const [relative, content] of writes) {
    const destination = path.join(root, relative)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    const temporary = destination + `.tmp-${process.pid}`
    fs.writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx' })
    staged.push({ temporary, destination })
  }
  for (const { temporary, destination } of staged) fs.renameSync(temporary, destination)
} finally {
  for (const { temporary } of staged) {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary)
  }
}
console.log(example
  ? 'Example configuration prepared. Cloud access is disabled; run npm run setup with .env.local before deployment.'
  : 'Local configuration prepared. Deployment identifiers were not printed.')
console.log(`Application version: ${version} (${versionCode})`)
