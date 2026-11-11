'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const repository = path.resolve(__dirname, '..');
const artifactRoot = path.join(repository, '.artifacts');
const appid = 'wx' + '1'.repeat(16);
const resourceAppid = 'wx' + '2'.repeat(16);
const generatedPaths = ['project.config.json', 'src/config.local.json', 'src/version.json', 'cloudfunctions/xishiTuotuoApi/local-config.json', 'src/manifest.json'];

function fixture(context, options = {}) {
  fs.mkdirSync(artifactRoot, { recursive: true });
  const root = fs.mkdtempSync(path.join(artifactRoot, 'config-test-'));
  context.after(() => {
    const resolved = path.resolve(root);
    assert.equal(path.dirname(resolved), path.resolve(artifactRoot));
    assert.ok(path.basename(resolved).startsWith('config-test-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.copyFileSync(path.join(repository, 'scripts/prepare-local-config.cjs'), path.join(root, 'scripts/prepare-local-config.cjs'));
  fs.copyFileSync(path.join(repository, 'project.config.template.json'), path.join(root, 'project.config.template.json'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: options.version || '0.1.0' }));
  if (options.env !== undefined) fs.writeFileSync(path.join(root, '.env.local'), options.env);
  const baseEnvironment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !['WECHAT_APPID', 'CLOUD_ENV_ID', 'CLOUD_RESOURCE_APPID'].includes(key)));
  return {
    root,
    run(args = [], env = {}) {
      return spawnSync(process.execPath, [path.join(root, 'scripts/prepare-local-config.cjs'), ...args], { cwd: root, env: Object.assign({}, baseEnvironment, env), encoding: 'utf8', windowsHide: true });
    },
    read(filename) { return fs.readFileSync(path.join(root, filename), 'utf8'); },
    json(filename) { return JSON.parse(this.read(filename)); },
    module(filename) {
      const sandbox = { module: { exports: {} } };
      vm.runInNewContext(this.read(filename), sandbox);
      return JSON.parse(JSON.stringify(sandbox.module.exports));
    },
    write(filename, content) {
      fs.mkdirSync(path.dirname(path.join(root, filename)), { recursive: true });
      fs.writeFileSync(path.join(root, filename), content);
    },
    snapshot() { return generatedPaths.map(filename => fs.existsSync(path.join(root, filename)) ? this.read(filename) : null); }
  };
}
function envFile(resource = '') {
  return `WECHAT_APPID=${appid}\nCLOUD_ENV_ID=sample-environment\nCLOUD_RESOURCE_APPID=${resource}\n`;
}

test('setup requires local configuration and does not create files when it is missing', context => {
  const local = fixture(context);
  const result = local.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing .env.local/);
  assert.deepEqual(local.snapshot(), [null, null, null, null, null]);
});

test('example mode ignores deployment environment variables and disables cloud identity', context => {
  const local = fixture(context);
  const result = local.run(['--example'], { WECHAT_APPID: appid, CLOUD_ENV_ID: 'sample-environment', CLOUD_RESOURCE_APPID: resourceAppid });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(local.json('project.config.json').appid, 'touristappid');
  assert.deepEqual(local.json('src/config.local.json'), { envId: '', resourceAppid: '', functionName: 'xishiTuotuoApi' });
  assert.deepEqual(local.json('cloudfunctions/xishiTuotuoApi/local-config.json'), { allowedAppId: '' });
  assert.deepEqual(local.json('src/version.json'), { version: '0.1.0', versionCode: 100 });
  assert.ok(!result.stdout.includes(appid) && !result.stdout.includes(resourceAppid));
});

test('own-environment setup leaves optional resource owner empty and preserves unrelated local settings', context => {
  const local = fixture(context, { env: envFile() });
  local.write('project.config.json', JSON.stringify({ localSetting: 'preserved', setting: { localFlag: true, es6: false } }));
  const result = local.run();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(local.json('src/config.local.json'), { envId: 'sample-environment', resourceAppid: '', functionName: 'xishiTuotuoApi' });
  const project = local.json('project.config.json');
  assert.equal(project.appid, appid);
  assert.equal(project.miniprogramRoot, 'dist/build/mp-weixin/');
  assert.equal(project.cloudfunctionRoot, 'cloudfunctions/');
  assert.equal(project.localSetting, 'preserved');
  assert.equal(project.setting.localFlag, true);
  assert.equal(project.setting.es6, true);
});

test('shared-environment setup separates client resource owner from the allowed calling app', context => {
  const local = fixture(context, { env: envFile(resourceAppid) });
  const result = local.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(local.json('src/config.local.json').resourceAppid, resourceAppid);
  assert.deepEqual(local.json('cloudfunctions/xishiTuotuoApi/local-config.json'), { allowedAppId: appid });
  assert.equal(local.json('project.config.json').appid, appid);
  assert.ok(!result.stdout.includes(resourceAppid) && !result.stdout.includes(appid) && !result.stdout.includes('sample-environment'));
});

test('process overrides can set or clear the optional resource owner', context => {
  const local = fixture(context, { env: envFile(resourceAppid) });
  assert.equal(local.run([], { CLOUD_RESOURCE_APPID: '' }).status, 0);
  assert.equal(local.json('src/config.local.json').resourceAppid, '');
  const third = 'wx' + '3'.repeat(16);
  assert.equal(local.run([], { CLOUD_RESOURCE_APPID: third }).status, 0);
  assert.equal(local.json('src/config.local.json').resourceAppid, third);
  assert.equal(local.run([], { CLOUD_ENV_ID: 'override-environment' }).status, 0);
  assert.equal(local.json('src/config.local.json').envId, 'override-environment');
});

test('invalid or duplicate identifiers fail before replacing existing generated files', context => {
  const cases = [
    [envFile('invalid'), /CLOUD_RESOURCE_APPID/],
    [envFile(appid), /must differ/],
    [envFile().replace('sample-environment', 'cloud1'), /full environment ID/],
    [envFile().replace(appid, 'invalid-app'), /WECHAT_APPID/],
    [envFile() + 'CLOUD_RESOURCE_APPID=\n', /Duplicate/],
    [envFile() + 'UNRECOGNIZED=anything\n', /Unsupported/],
    ['WECHAT_APPID="unterminated\nCLOUD_ENV_ID=sample-environment\n', /quoted/]
  ];
  for (const [env, expected] of cases) {
    const local = fixture(context);
    assert.equal(local.run(['--example']).status, 0);
    const before = local.snapshot();
    local.write('.env.local', env);
    const result = local.run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, expected);
    assert.deepEqual(local.snapshot(), before);
  }
});

test('quoted UTF-8 local configuration and an omitted resource owner are accepted', context => {
  const local = fixture(context, { env: '\ufeff# 本地配置\nWECHAT_APPID=\'' + appid + '\'\nCLOUD_ENV_ID="sample-environment"\n' });
  const result = local.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(local.json('src/config.local.json').resourceAppid, '');
});

test('package version is the single version source with ordered numeric codes and bounded components', context => {
  for (const [version, versionCode] of [['0.1.0', 100], ['1.10.0', 11000], ['2.0.0', 20000], ['1.0.2-r1', 10002]]) {
    const local = fixture(context, { version });
    const result = local.run(['--example']);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(local.json('src/version.json'), { version, versionCode });
  }
  for (const version of ['bad', '1.100.0', '1.0.100', '999999999.0.0']) {
    const local = fixture(context, { version });
    const result = local.run(['--example']);
    assert.notEqual(result.status, 0);
    assert.deepEqual(local.snapshot(), [null, null, null, null, null]);
  }
});

test('unknown arguments and malformed project configuration do not overwrite prior files', context => {
  const local = fixture(context, { env: envFile() });
  assert.equal(local.run().status, 0);
  const before = local.snapshot();
  for (const args of [['--unknown'], ['--example', '--example']]) {
    assert.notEqual(local.run(args).status, 0);
    assert.deepEqual(local.snapshot(), before);
  }
  local.write('project.config.json', '{');
  const broken = local.snapshot();
  assert.notEqual(local.run().status, 0);
  assert.deepEqual(local.snapshot(), broken);
});
