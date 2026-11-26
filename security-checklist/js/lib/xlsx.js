// 엑셀(xlsx) 읽기·쓰기. 기준 양식과 결과 내보내기에 씁니다.
(function (app) {
  'use strict';

  const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const MAX_CELL = 32767;

  const byTag = (node, name) => [...node.getElementsByTagNameNS('*', name)];
  const unescapeExcel = text => text.replace(/_x([0-9A-Fa-f]{4})_/g, (_, hex) => hex.toUpperCase() === '000D' ? '' : String.fromCharCode(parseInt(hex, 16)));

  function columnIndex(ref) {
    const letters = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() || 'A';
    return [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  }
  function columnName(index) {
    let name = '';
    for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + (n - 1) % 26) + name;
    return name;
  }

  // 공유 문자열·인라인 문자열의 텍스트 (윗주 rPh 제외)
  const richText = node => byTag(node, 't').filter(t => !t.closest || !t.closest('rPh')).map(t => t.textContent).join('');

  // ArrayBuffer → { sheets: [{ name, rows: string[][] }] }
  async function readWorkbook(buffer) {
    const zip = app.zip.readZip(buffer);
    if (!zip.has('xl/workbook.xml')) throw new Error('엑셀(xlsx) 파일이 아닙니다.');
    const parse = async name => {
      const doc = new DOMParser().parseFromString(await zip.text(name), 'application/xml');
      if (doc.getElementsByTagName('parsererror').length) throw new Error(name + ' 내용을 읽을 수 없습니다.');
      return doc;
    };
    const workbook = await parse('xl/workbook.xml');
    const targets = new Map();
    if (zip.has('xl/_rels/workbook.xml.rels')) {
      for (const rel of byTag(await parse('xl/_rels/workbook.xml.rels'), 'Relationship')) targets.set(rel.getAttribute('Id'), rel.getAttribute('Target'));
    }
    const shared = zip.has('xl/sharedStrings.xml') ? byTag(await parse('xl/sharedStrings.xml'), 'si').map(si => unescapeExcel(richText(si))) : [];

    const sheets = [];
    for (const sheet of byTag(workbook, 'sheet')) {
      const target = targets.get(sheet.getAttributeNS(REL_NS, 'id') || sheet.getAttribute('r:id'));
      if (!target) continue;
      const path = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
      if (!zip.has(path)) continue;
      const rows = [];
      let rowNumber = 0;
      for (const row of byTag(await parse(path), 'row')) {
        rowNumber = Number(row.getAttribute('r')) || rowNumber + 1;
        const cells = [];
        let col = -1;
        for (const c of [...row.children].filter(el => el.localName === 'c')) {
          col = c.getAttribute('r') ? columnIndex(c.getAttribute('r')) : col + 1;
          const type = c.getAttribute('t');
          const v = [...c.children].find(el => el.localName === 'v')?.textContent ?? '';
          let value;
          if (type === 's') value = shared[Number(v)] ?? '';
          else if (type === 'inlineStr') value = unescapeExcel(richText(c));
          else if (type === 'b') value = v === '1' ? 'TRUE' : 'FALSE';
          else value = unescapeExcel(v);
          cells[col] = value;
        }
        rows[rowNumber - 1] = Array.from(cells, x => x ?? '');
      }
      sheets.push({ name: sheet.getAttribute('name'), rows: Array.from(rows, r => r || []) });
    }
    return { sheets };
  }

  // 엑셀 날짜 일련번호(1900 체계) → YYYY-MM-DD
  function serialToDate(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 20000 || n > 80000) return null;
    return new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000).toISOString().slice(0, 10);
  }

  const escapeXml = value => String(value)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F￾￿]/g, '')
    .replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="${MAIN_NS}"><fonts count="2"><font><sz val="10"/><name val="맑은 고딕"/></font><font><b/><sz val="10"/><name val="맑은 고딕"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF2F8"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

  function sheetXml(sheet) {
    const header = sheet.headerRows ?? 1;
    const rows = sheet.rows.map((row, r) => {
      const cells = row.map((value, c) => {
        if (value === null || value === undefined || value === '') return '';
        const ref = columnName(c) + (r + 1), style = r < header ? ' s="1"' : '';
        if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"${style}><v>${value}</v></c>`;
        const text = String(value).slice(0, MAX_CELL);
        return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
      }).join('');
      return `<row r="${r + 1}">${cells}</row>`;
    }).join('');
    const pane = header ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${header}" topLeftCell="A${header + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : '';
    const cols = sheet.widths?.length ? '<cols>' + sheet.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>' : '';
    const lists = (sheet.validations || []).filter(v => v.values.length);
    const validations = lists.length ? `<dataValidations count="${lists.length}">` + lists.map(v => {
      const col = columnName(v.column);
      return `<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="${col}${v.fromRow || header + 1}:${col}${v.toRow || 3000}"><formula1>"${escapeXml(v.values.join(','))}"</formula1></dataValidation>`;
    }).join('') + '</dataValidations>' : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="${MAIN_NS}" xmlns:r="${REL_NS}">${pane}<sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${rows}</sheetData>${validations}</worksheet>`;
  }

  // sheets: [{ name, rows, widths?, headerRows?, validations?: [{ column, values }] }] → Blob
  function writeWorkbook(sheets) {
    const safeName = (name, i) => (String(name).replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Sheet' + (i + 1));
    const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="${MAIN_NS}" xmlns:r="${REL_NS}"><sheets>${sheets.map((s, i) => `<sheet name="${escapeXml(safeName(s.name, i))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`;
    const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL_NS}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="${REL_NS}/styles" Target="styles.xml"/></Relationships>`;
    const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
    const root = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
    return app.zip.writeZip([
      { name: '[Content_Types].xml', data: types },
      { name: '_rels/.rels', data: root },
      { name: 'xl/workbook.xml', data: workbook },
      { name: 'xl/_rels/workbook.xml.rels', data: rels },
      { name: 'xl/styles.xml', data: STYLES },
      ...sheets.map((sheet, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(sheet) }))
    ], XLSX_TYPE);
  }

  app.xlsx = { readWorkbook, writeWorkbook, serialToDate, columnName };
})(window.SecurityChecklist = window.SecurityChecklist || {});
