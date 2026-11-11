'use strict';

// Small OOXML writer for WeChat: no Buffer, TextEncoder or external dependencies.
function cleanText(value) {
  const source = value === undefined || value === null ? '' : String(value);
  let result = '';
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    if ((code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 0xfffe || code === 0xffff) continue;
    if (code >= 0xd800 && code <= 0xdbff) {
      const low = source.charCodeAt(index + 1);
      if (low >= 0xdc00 && low <= 0xdfff) { result += source[index] + source[++index]; }
      else result += '\ufffd';
    } else result += code >= 0xdc00 && code <= 0xdfff ? '\ufffd' : source[index];
  }
  return result;
}
function utf8(value) {
  const source = cleanText(value);
  const bytes = [];
  for (let index = 0; index < source.length; index += 1) {
    let code = source.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) code = 0x10000 + ((code - 0xd800) << 10) + source.charCodeAt(++index) - 0xdc00;
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
  }
  return new Uint8Array(bytes);
}
function xml(value) {
  return cleanText(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function cellText(value) {
  let text = cleanText(value);
  if (text.length > 32767) {
    text = text.slice(0, 32767);
    if (/[\ud800-\udbff]$/.test(text)) text = text.slice(0, -1);
  }
  // Preserve literal OOXML escape-looking strings instead of letting Excel decode them.
  return xml(text.replace(/_x[0-9a-f]{4}_/gi, match => '_x005F_' + match.slice(1)));
}
function crc32(bytes) {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc ^= bytes[index];
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function join(parts) {
  const size = parts.reduce((total, part) => total + part.length, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  parts.forEach(part => { result.set(part, offset); offset += part.length; });
  return result;
}
function zip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  entries.forEach(entry => {
    const name = utf8(entry.name);
    const data = typeof entry.data === 'string' ? utf8(entry.data) : entry.data;
    const checksum = crc32(data);
    const local = new Uint8Array(30);
    const header = new DataView(local.buffer);
    header.setUint32(0, 0x04034b50, true);
    header.setUint16(4, 20, true);
    header.setUint16(6, 0x0800, true);
    header.setUint16(12, 0x0021, true); // 1980-01-01, deterministic archive metadata.
    header.setUint32(14, checksum, true);
    header.setUint32(18, data.length, true);
    header.setUint32(22, data.length, true);
    header.setUint16(26, name.length, true);
    const central = new Uint8Array(46);
    const directory = new DataView(central.buffer);
    directory.setUint32(0, 0x02014b50, true);
    directory.setUint16(4, 20, true);
    directory.setUint16(6, 20, true);
    directory.setUint16(8, 0x0800, true);
    directory.setUint16(14, 0x0021, true);
    directory.setUint32(16, checksum, true);
    directory.setUint32(20, data.length, true);
    directory.setUint32(24, data.length, true);
    directory.setUint16(28, name.length, true);
    directory.setUint32(42, offset, true);
    localParts.push(local, name, data);
    centralParts.push(central, name);
    offset += local.length + name.length + data.length;
  });
  const central = join(centralParts);
  const end = new Uint8Array(22);
  const view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, entries.length, true);
  view.setUint16(10, entries.length, true);
  view.setUint32(12, central.length, true);
  view.setUint32(16, offset, true);
  return join(localParts.concat([central, end]));
}
function columnName(index) {
  let name = '';
  for (let number = index + 1; number > 0; number = Math.floor((number - 1) / 26)) name = String.fromCharCode(65 + (number - 1) % 26) + name;
  return name;
}
function sheetXml(sheet) {
  const rows = sheet.rows;
  const columns = rows.reduce((max, row) => Math.max(max, row.length), 1);
  if (rows.length > 1048576 || columns > 16384) throw new Error('导出内容超出表格容量');
  const range = 'A1:' + columnName(columns - 1) + Math.max(rows.length, 1);
  const widths = Array.from({ length: columns }, (_, index) => {
    const supplied = sheet.widths && sheet.widths[index];
    const width = Number.isFinite(supplied) ? Math.min(70, Math.max(10, supplied)) : 24;
    return `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`;
  }).join('');
  const cells = rows.map((row, index) => `<row r="${index + 1}"${index === 0 ? ' ht="28" customHeight="1"' : ''}>` + row.map((value, col) => `<c r="${columnName(col)}${index + 1}" s="${index === 0 ? 1 : 0}" t="inlineStr"><is><t xml:space="preserve">${cellText(value)}</t></is></c>`).join('') + '</row>').join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<dimension ref="${range}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="22"/><cols>${widths}</cols><sheetData>${cells}</sheetData><autoFilter ref="${range}"/><pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/></worksheet>`;
}
const STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Microsoft YaHei"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Microsoft YaHei"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF954B50"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1" applyNumberFormat="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="49" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1" applyFont="1" applyFill="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

function createWorkbook(input, options) {
  options = options || {};
  if (!Array.isArray(input) || !input.length || input.length > 100) throw new Error('请选择要导出的内容');
  const used = new Set();
  const sheets = input.map((sheet, index) => {
    if (!sheet || !Array.isArray(sheet.rows) || sheet.rows.some(row => !Array.isArray(row))) throw new Error('导出表格格式不正确');
    const base = cleanText(sheet.name || '工作表' + (index + 1)).replace(/[\\/\[\]:*?]/g, ' ').replace(/^'+|'+$/g, '').slice(0, 31) || '工作表';
    let name = base;
    for (let suffix = 2; used.has(name.toLowerCase()); suffix += 1) name = base.slice(0, 31 - String(suffix).length - 1) + '_' + suffix;
    used.add(name.toLowerCase());
    return { name, rows: sheet.rows.length ? sheet.rows : [['暂无数据']], widths: sheet.widths };
  });
  const spreadsheet = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const relationships = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const packageRel = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const files = [
    { name: '[Content_Types].xml', data: declaration + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' + sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>' },
    { name: '_rels/.rels', data: declaration + `<Relationships xmlns="${packageRel}"><Relationship Id="rId1" Type="${relationships}/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="${relationships}/extended-properties" Target="docProps/app.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', data: declaration + `<workbook xmlns="${spreadsheet}" xmlns:r="${relationships}"><sheets>` + sheets.map((sheet, index) => `<sheet name="${xml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('') + '</sheets></workbook>' },
    { name: 'xl/_rels/workbook.xml.rels', data: declaration + `<Relationships xmlns="${packageRel}">` + sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="${relationships}/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('') + `<Relationship Id="rId${sheets.length + 1}" Type="${relationships}/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', data: STYLES },
    { name: 'docProps/core.xml', data: declaration + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>喜事妥妥</dc:creator><dc:description>' + xml(options.version ? '喜事妥妥 ' + options.version : '喜事妥妥婚礼筹备资料') + '</dc:description></cp:coreProperties>' },
    { name: 'docProps/app.xml', data: declaration + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>喜事妥妥</Application></Properties>' }
  ];
  sheets.forEach((sheet, index) => files.push({ name: `xl/worksheets/sheet${index + 1}.xml`, data: sheetXml(sheet) }));
  return zip(files);
}

export default { createWorkbook, utf8, crc32, cleanText, columnName };
