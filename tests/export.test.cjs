'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createWorkbook, utf8, crc32, cleanText, columnName } = require('../miniprogram/utils/xlsx');
const { buildSheets, CATEGORIES } = require('../miniprogram/utils/export-data');

function archive(bytes) {
  const buffer = Buffer.from(bytes);
  const end = buffer.length - 22;
  assert.equal(buffer.readUInt32LE(end), 0x06054b50);
  assert.equal(buffer.readUInt16LE(end + 4), 0);
  assert.equal(buffer.readUInt16LE(end + 6), 0);
  const count = buffer.readUInt16LE(end + 10);
  assert.equal(buffer.readUInt16LE(end + 8), count);
  const directorySize = buffer.readUInt32LE(end + 12);
  let directory = buffer.readUInt32LE(end + 16);
  assert.equal(directory + directorySize, end);
  const entries = new Map();
  for (let index = 0; index < count; index += 1) {
    assert.equal(buffer.readUInt32LE(directory), 0x02014b50);
    const nameLength = buffer.readUInt16LE(directory + 28);
    const extraLength = buffer.readUInt16LE(directory + 30);
    const commentLength = buffer.readUInt16LE(directory + 32);
    const name = buffer.subarray(directory + 46, directory + 46 + nameLength).toString('utf8');
    const position = buffer.readUInt32LE(directory + 42);
    assert.equal(buffer.readUInt32LE(position), 0x04034b50);
    assert.equal(buffer.readUInt16LE(position + 6), 0x0800);
    assert.equal(buffer.readUInt16LE(position + 8), 0, 'ZIP uses the store method');
    assert.equal(buffer.readUInt16LE(position + 26), nameLength);
    const length = buffer.readUInt32LE(position + 22);
    assert.equal(buffer.readUInt32LE(position + 18), length);
    assert.equal(buffer.readUInt32LE(directory + 24), length);
    const start = position + 30 + nameLength + buffer.readUInt16LE(position + 28);
    const data = buffer.subarray(start, start + length);
    const checksum = crc32(data);
    assert.equal(buffer.readUInt32LE(position + 14), checksum);
    assert.equal(buffer.readUInt32LE(directory + 16), checksum);
    assert.equal(buffer.subarray(position + 30, position + 30 + nameLength).toString('utf8'), name);
    assert.ok(!entries.has(name), 'ZIP members must be unique');
    entries.set(name, data.toString('utf8'));
    directory += 46 + nameLength + extraLength + commentLength;
  }
  assert.equal(directory, end);
  return entries;
}
function fixture() {
  return {
    id: 'private-group-id', joinCode: 'private-join-code', token: 'private-invitation-token', ownerId: 'private-owner-id',
    profile: { title: '小满与阿哲的婚礼', bride: '小满', groom: '阿哲', date: '2027-05-20', venue: '桃园厅', address: '幸福路 8 号', coverFileID: 'private-media-id' },
    members: [{ id: 'private-openid', nickname: '妈妈', role: '新娘母亲' }],
    tasks: [{ id: 'task-id', title: '=HYPERLINK("danger")', dueDate: '2027-05-10', assigneeId: 'private-openid', done: true, note: '事项私人说明' }, { title: '确认菜单', assigneeId: 'missing-member', done: false }],
    items: [{ name: '喜糖', quantity: 20, status: 'ready', assigneeId: 'private-openid', note: '物品私人说明' }],
    vendors: [{ name: '花艺 & 布置', category: '婚庆', contact: '李师傅', phone: '13800001111', quote: 1200.5, status: 'booked', note: '商家私人说明' }],
    guests: [
      { id: 'private-guest-id', name: '王叔叔一家', side: 'groom', relation: '亲戚', phone: '13900002222', partySize: 3, attendance: 'yes', needsLodging: true, tableId: 'private-table-id', note: '宾客私人说明', replyNote: '亲友私人留言' },
      { id: 'guest-pending', name: '朋友甲', partySize: 2, attendance: 'pending', tableId: 'deleted-table-id' },
      { id: 'guest-no', name: '朋友乙', partySize: 1, attendance: 'no', tableId: 'private-table-id' }
    ],
    tables: [{ id: 'private-table-id', name: '亲友一桌', capacity: 10 }, { id: 'table-empty', name: '备用桌', capacity: 12 }],
    timeline: [{ time: '12:00', title: '仪式', place: '宴会厅', assigneeId: 'private-openid', note: '流程私人说明' }, { time: '08:00', title: '化妆', assigneeId: '' }],
    lodgings: [{ hotel: '幸福酒店', room: '1208', checkIn: '2027-05-19', checkOut: '2027-05-21', guestIds: ['private-guest-id', 'deleted-guest-id'], note: '住宿私人说明' }],
    invitations: [{ token: 'private-invitation-token' }]
  };
}

test('UTF-8, XML text and CRC handle Chinese, emoji and invalid code points without platform encoders', () => {
  assert.equal(crc32(utf8('123456789')), 0xcbf43926);
  const dirty = '婚礼💒 & < > " \'\n\t\u0000\u0007\ufffe\ud800';
  assert.equal(cleanText(dirty), '婚礼💒 & < > " \'\n\t\ufffd');
  assert.deepEqual(Buffer.from(utf8(dirty)), Buffer.from(cleanText(dirty), 'utf8'));
  assert.equal(columnName(0), 'A'); assert.equal(columnName(25), 'Z'); assert.equal(columnName(26), 'AA'); assert.equal(columnName(16383), 'XFD');
});

test('workbook has a valid ZIP directory, CRCs, relationships, inline strings and escaped literal text', () => {
  const entries = archive(createWorkbook([{ name: '宾客 / 名单', rows: [['名称', '备注'], ['王叔叔💒', '=SUM(A1)'], ['<&"\'>\u0001', '_x0041_'], ['\ud800', '+123']] }], { version: '0.1.0' }));
  assert.equal(entries.size, 8);
  for (const member of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'docProps/core.xml', 'docProps/app.xml', 'xl/worksheets/sheet1.xml']) assert.ok(entries.has(member));
  assert.match(entries.get('xl/workbook.xml'), /name="宾客   名单"/);
  assert.match(entries.get('xl/_rels/workbook.xml.rels'), /Target="worksheets\/sheet1.xml"/);
  assert.match(entries.get('[Content_Types].xml'), /PartName="\/xl\/worksheets\/sheet1.xml"/);
  const sheet = entries.get('xl/worksheets/sheet1.xml');
  assert.match(sheet, /王叔叔💒/);
  assert.match(sheet, /&lt;&amp;&quot;&apos;&gt;/);
  assert.match(sheet, /_x005F_x0041_/);
  assert.match(sheet, />=SUM\(A1\)<\/t>/);
  assert.ok(!/<f(?:\s|>)/.test(sheet), 'user input must never become a formula');
  assert.equal((sheet.match(/t="inlineStr"/g) || []).length, 8);
  assert.ok(!sheet.includes('\u0001'));
  assert.match(sheet, /ref="A1:B4"/);
});

test('duplicate and invalid worksheet names become unique legal names', () => {
  const entries = archive(createWorkbook([{ name: 'a/b', rows: [] }, { name: 'a:b', rows: [] }, { name: 'a/b', rows: [] }]));
  const workbook = entries.get('xl/workbook.xml');
  assert.match(workbook, /name="a b"/); assert.match(workbook, /name="a b_2"/); assert.match(workbook, /name="a b_3"/);
  assert.throws(() => createWorkbook([]), /请选择/);
});

test('default export whitelists fields, hides contact details and notes, and resolves related records', () => {
  const group = fixture();
  const original = JSON.stringify(group);
  const sheets = buildSheets(group);
  assert.equal(sheets.length, 8);
  const output = JSON.stringify(sheets);
  for (const hidden of ['private-group-id', 'private-join-code', 'private-invitation-token', 'private-owner-id', 'private-openid', 'private-media-id', 'private-guest-id', 'private-table-id', 'deleted-table-id', 'deleted-guest-id', '13800001111', '13900002222', '私人说明', '私人留言']) assert.ok(!output.includes(hidden), hidden + ' must remain private');
  const tasks = sheets.find(sheet => sheet.name === '事项清单');
  assert.equal(tasks.rows[1][2], '妈妈'); assert.equal(tasks.rows[2][2], '未分工');
  const guests = sheets.find(sheet => sheet.name === '宾客名单');
  assert.equal(guests.rows[1][6], '亲友一桌'); assert.equal(guests.rows[1][7], '幸福酒店 / 1208');
  const seats = sheets.find(sheet => sheet.name === '座位安排');
  assert.deepEqual(seats.rows[1].slice(0, 6), ['亲友一桌', 10, 3, 7, '王叔叔一家', 3]);
  assert.ok(seats.rows.some(row => row[0] === '未排桌' && row[4] === '朋友甲'));
  assert.ok(!JSON.stringify(seats).includes('朋友乙'));
  const overview = sheets.find(sheet => sheet.name === '婚礼简况');
  assert.equal(overview.rows.find(row => row[0] === '筹备进度')[1], '50%');
  const flow = sheets.find(sheet => sheet.name === '当天流程');
  assert.equal(flow.rows[1][0], '08:00');
  assert.equal(JSON.stringify(group), original, 'export must not mutate live data');
  const zip = archive(createWorkbook(sheets));
  assert.equal([...zip.keys()].filter(name => name.startsWith('xl/worksheets/')).length, 8);
});

test('privacy fields require explicit opt-in and a category produces only the requested sheet', () => {
  const sheets = buildSheets(fixture(), { category: 'guests', includePhones: true, includeNotes: true });
  assert.equal(sheets.length, 1); assert.equal(sheets[0].name, '宾客名单');
  const data = JSON.stringify(sheets);
  assert.match(data, /13900002222/); assert.match(data, /宾客私人说明/); assert.match(data, /亲友私人留言/);
  assert.ok(!data.includes('private-openid'));
  assert.ok(!JSON.stringify(buildSheets(fixture(), { includePhones: 'true', includeNotes: 1 })).includes('13900002222'));
});

test('empty and missing arrays retain readable headers and zero progress', () => {
  const sheets = buildSheets({});
  assert.equal(sheets.length, 8);
  assert.equal(sheets[0].rows.find(row => row[0] === '筹备进度')[1], '0%');
  for (const sheet of sheets.slice(1)) assert.equal(sheet.rows.length, 1);
  assert.doesNotThrow(() => archive(createWorkbook(sheets)));
  assert.throws(() => buildSheets(null), /群组/);
  assert.throws(() => buildSheets({}, { category: 'unknown' }), /类别/);
  assert.equal(CATEGORIES.length, 9);
});

function pageHarness(options = {}) {
  let definition;
  const calls = { writes: [], deleted: [], toasts: [], errors: [], opened: [], shared: [], groupReads: 0 };
  const manager = {
    writeFile(input) { calls.writes.push(input); options.writeFailure ? input.fail({ errMsg: 'writeFile:fail quota' }) : input.success({}); },
    readdir(input) { input.success({ files: ['xishi-export-old.xlsx', 'photo.png', 'other-export-old.xlsx', '../xishi-export-outside.xlsx', 'xishi-export-work.tmp'] }); },
    unlink(input) { calls.deleted.push(input.filePath); input.success({}); }
  };
  const service = {
    async getGroup() { calls.groupReads++; if (options.noGroup) { const error = new Error('请先加入群组'); error.code = 'NO_GROUP'; throw error; } return fixture(); },
    showError(error) { calls.errors.push(error.message); }
  };
  const wx = {
    env: { USER_DATA_PATH: '/sandbox' }, getFileSystemManager: () => manager,
    showToast(input) { calls.toasts.push(input); }, navigateTo(input) { calls.navigation = input.url; },
    openDocument(input) { calls.opened.push(input); input.success({}); },
    shareFileMessage(input) { calls.shared.push(input); input.success({}); }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../miniprogram/pages/export/index.js'), 'utf8'), {
    Page(page) { definition = page; }, wx, console,
    require(name) {
      if (name === '../../utils/service') return service;
      if (name === '../../utils/export-data') return { buildSheets, CATEGORIES };
      if (name === '../../utils/xlsx') return { createWorkbook };
      if (name === '../../version') return { version: '0.1.0' };
      throw new Error('Unexpected module ' + name);
    }
  });
  const page = Object.assign({}, definition, { data: JSON.parse(JSON.stringify(definition.data)), setData(next) { Object.assign(this.data, next); } });
  return { page, calls };
}

test('page saves real XLSX, refreshes membership and removes only its old export files', async () => {
  const { page, calls } = pageHarness();
  await page.load(); await page.exportFile();
  assert.equal(calls.groupReads, 2);
  assert.equal(calls.writes.length, 1);
  assert.equal(archive(new Uint8Array(calls.writes[0].data)).size, 15);
  assert.deepEqual(calls.deleted, ['/sandbox/xishi-export-old.xlsx']);
  assert.match(page.data.filePath, /^\/sandbox\/xishi-export-.*\.xlsx$/);
  assert.equal(page.data.sheetCount, 8); assert.equal(page.data.generating, false);
  assert.equal(calls.toasts.filter(toast => toast.icon === 'success').length, 1);
  await page.openFile(); await page.shareFile();
  assert.equal(calls.opened[0].fileType, 'xlsx'); assert.equal(calls.opened[0].showMenu, true);
  assert.equal(calls.shared[0].filePath, page.data.filePath);
});

test('page never reports success for failed saves and keeps unrelated or previous exports intact', async () => {
  const { page, calls } = pageHarness({ writeFailure: true });
  await page.load(); await page.exportFile();
  assert.equal(page.data.filePath, ''); assert.equal(page.data.generating, false);
  assert.match(page.data.exportError, /未能保存/);
  assert.equal(calls.toasts.filter(toast => toast.icon === 'success').length, 0);
  assert.ok(!calls.deleted.includes('/sandbox/xishi-export-old.xlsx'));
  assert.equal(calls.deleted[0], calls.writes[0].filePath, 'only a possibly partial new file is removed');
});

test('page offers group navigation when no group is selected', async () => {
  const { page, calls } = pageHarness({ noGroup: true });
  await page.load(); assert.equal(page.data.noGroup, true); assert.equal(page.data.loading, false);
  page.goGroup(); assert.equal(calls.navigation, '/pages/group/index');
  await page.exportFile(); assert.equal(calls.writes.length, 0);
});
