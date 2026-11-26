// 점검 기준 문서(docx·hwpx) → 기준 양식 초안.
// 문서의 표를 읽어 항목을 뽑고, 결과는 반드시 엑셀 양식으로 내려받아 검토한 뒤 등록합니다.
//
// 읽는 표의 형태
//  1) 머리글 표: 첫 행에 '번호/항목ID/코드', '항목명/점검 항목/취약점명', '위험도/중요도/등급' 등이 있는 목록 표
//  2) 항목 상세 표: '평가항목ID | 값 | 위험도 | 값', '평가항목', '점검 내용', '■ 점검 기준', '■ 대응 방안', '조치 시 영향' 행으로 된 표
// 문단 중 '□ 관리적 분야' 같은 제목은 영역으로, '가. 웹 서비스' 같은 제목은 대상 유형으로 씁니다.
(function (app) {
  'use strict';

  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const PICTURE = '[그림: 원문 참조]';
  const norm = text => String(text || '').replace(/\s+/g, '').replace(/[·ㆍ・]/g, '');

  // ── 공통 표 모델 ─────────────────────────────────────────
  // cell = { lines: [문단...] }, table = { grid: cell[][] (병합 칸 채움), raw: cell[][] (실제 칸) }
  const cellText = (cell, sep = ' ') => (cell?.lines || []).map(s => s.trim()).filter(Boolean).join(sep);

  // ── docx ─────────────────────────────────────────────────
  function docxParagraphs(p, out) {
    let buf = '';
    const extra = [];
    (function walk(node) {
      for (const child of node.children) {
        const name = child.localName;
        if (name === 'Fallback') continue; // mc:AlternateContent 의 대체본(같은 내용) 건너뜀
        if (name === 'txbxContent') { for (const q of child.children) { if (q.localName === 'p') docxParagraphs(q, extra); else if (q.localName === 'tbl') extra.push(...docxTableLines(q)); } continue; }
        if (name === 'pic' || name === 'imagedata') { buf += PICTURE; continue; }
        if (child.namespaceURI === W && name === 't') buf += child.textContent;
        else if (child.namespaceURI === W && name === 'tab') buf += '\t';
        else if (child.namespaceURI === W && (name === 'br' || name === 'cr')) buf += '\n';
        else walk(child);
      }
    })(p);
    for (const line of buf.split('\n')) if (line.trim()) out.push(line);
    out.push(...extra);
  }
  const docxTableLines = tbl => docxTable(tbl).raw.flatMap(row => row.map(c => cellText(c)).filter(Boolean));

  function docxCell(tc) {
    const lines = [];
    for (const child of tc.children) {
      if (child.localName === 'p') docxParagraphs(child, lines);
      else if (child.localName === 'tbl') lines.push(...docxTableLines(child));
      else if (child.localName === 'sdt') for (const p of child.getElementsByTagNameNS(W, 'p')) docxParagraphs(p, lines);
    }
    return { lines };
  }

  function docxTable(tbl) {
    const raw = [], grid = [];
    for (const tr of [...tbl.children].filter(el => el.localName === 'tr')) {
      const rawRow = [], gridRow = [];
      for (const tc of [...tr.children].filter(el => el.localName === 'tc')) {
        const pr = [...tc.children].find(el => el.localName === 'tcPr');
        const span = Number(pr && [...pr.children].find(el => el.localName === 'gridSpan')?.getAttributeNS(W, 'val')) || 1;
        const vMerge = pr && [...pr.children].find(el => el.localName === 'vMerge');
        let cell = docxCell(tc);
        const col = gridRow.length;
        if (vMerge && vMerge.getAttributeNS(W, 'val') !== 'restart' && grid.length) cell = grid[grid.length - 1][col] || cell;
        rawRow.push(cell);
        for (let i = 0; i < span; i++) gridRow.push(cell);
      }
      raw.push(rawRow); grid.push(gridRow);
    }
    return { raw, grid };
  }

  async function docxBlocks(zip) {
    const doc = new DOMParser().parseFromString(await zip.text('word/document.xml'), 'application/xml');
    const body = doc.getElementsByTagNameNS(W, 'body')[0];
    const blocks = [];
    (function walk(node) {
      for (const el of node.children) {
        if (el.localName === 'p') { const lines = []; docxParagraphs(el, lines); for (const text of lines) blocks.push({ type: 'p', text }); }
        else if (el.localName === 'tbl') blocks.push({ type: 'table', ...docxTable(el) });
        else if (el.localName === 'sdt' || el.localName === 'sdtContent' || el.localName === 'customXml') walk(el);
      }
    })(body);
    return blocks;
  }

  // ── hwpx ─────────────────────────────────────────────────
  function hwpxRunText(t) {
    let text = '';
    for (const node of t.childNodes) {
      if (node.nodeType === 3) text += node.nodeValue;
      else if (node.localName === 'tab') text += '\t';
      else if (node.localName === 'lineBreak') text += '\n';
      else text += node.textContent || '';
    }
    return text;
  }

  // 문단 하나 → { text, tables: [hp:tbl ...] } (표 안의 글자는 text 에 넣지 않음)
  function hwpxParagraph(p) {
    let text = '';
    const tables = [];
    (function walk(node) {
      for (const child of node.children) {
        const name = child.localName;
        if (name === 'tbl') { tables.push(child); continue; }
        if (name === 'pic') { text += PICTURE; continue; }
        if (name === 't') text += hwpxRunText(child);
        else if (name === 'script') text += child.textContent;
        else walk(child);
      }
    })(p);
    return { text, tables };
  }

  function hwpxCellLines(tc) {
    const lines = [];
    (function walk(node) {
      for (const child of node.children) {
        if (child.localName === 'p') {
          const { text, tables } = hwpxParagraph(child);
          for (const line of text.split('\n')) if (line.trim()) lines.push(line);
          for (const t of tables) lines.push(...hwpxTable(t).raw.flatMap(row => row.map(c => cellText(c)).filter(Boolean)));
        } else if (child.localName !== 'tbl') walk(child);
      }
    })(tc);
    return lines;
  }

  function hwpxTable(tbl) {
    const raw = [], placed = [];
    for (const tr of [...tbl.children].filter(el => el.localName === 'tr')) {
      const rawRow = [];
      for (const tc of [...tr.children].filter(el => el.localName === 'tc')) {
        const addr = [...tc.children].find(el => el.localName === 'cellAddr');
        const span = [...tc.children].find(el => el.localName === 'cellSpan');
        const cell = { lines: hwpxCellLines(tc) };
        rawRow.push(cell);
        placed.push({ cell, row: Number(addr?.getAttribute('rowAddr')) || 0, col: Number(addr?.getAttribute('colAddr')) || 0,
          rows: Number(span?.getAttribute('rowSpan')) || 1, cols: Number(span?.getAttribute('colSpan')) || 1 });
      }
      raw.push(rawRow);
    }
    const grid = [];
    for (const p of placed) {
      for (let r = p.row; r < p.row + p.rows; r++) for (let c = p.col; c < p.col + p.cols; c++) (grid[r] ||= [])[c] = p.cell;
    }
    return { raw, grid: Array.from(grid, row => Array.from(row || [], c => c || { lines: [] })) };
  }

  async function hwpxBlocks(zip) {
    const sections = zip.names.filter(n => /^Contents\/section\d+\.xml$/.test(n)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
    if (!sections.length) throw new Error('한글(hwpx) 본문을 찾을 수 없습니다.');
    const blocks = [];
    for (const name of sections) {
      const doc = new DOMParser().parseFromString(await zip.text(name), 'application/xml');
      (function walk(node) {
        for (const el of node.children) {
          if (el.localName === 'p') {
            const { text, tables } = hwpxParagraph(el);
            for (const line of text.split('\n')) if (line.trim()) blocks.push({ type: 'p', text: line });
            for (const t of tables) blocks.push({ type: 'table', ...hwpxTable(t) });
          } else walk(el);
        }
      })(doc.documentElement);
    }
    return blocks;
  }

  // ── 표 → 항목 ────────────────────────────────────────────
  const HEADER = {
    id: ['항목id', '평가항목id', '항목코드', '번호', '코드', 'id', '점검코드'],
    name: ['항목명', '평가항목', '점검항목', '취약점점검항목', '취약점명', '점검항목명', '항목'],
    level: ['위험도', '중요도', '등급', '위험등급'],
    category: ['분류', '분야', '구분', '대분류'],
    area: ['영역'],
    target: ['대상유형', '대상', '점검대상'],
    content: ['점검내용', '설명', '항목설명'],
    criteria: ['판단기준', '점검기준', '점검방법'],
    remediation: ['대응방안', '조치방안', '조치방법', '보안대책'],
    impact: ['조치시영향'],
    ref: ['원문위치', '페이지', '쪽']
  };
  // 머리글 칸 → { field, rank }. 같은 필드에 칸이 여럿이면 rank 가 낮은(더 구체적인) 칸을 씁니다.
  function fieldOfHeader(text) {
    const key = norm(text).toLowerCase();
    for (const field of Object.keys(HEADER)) {
      const rank = HEADER[field].indexOf(key);
      if (rank >= 0) return { field, rank };
    }
    return null;
  }
  const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.\-]{0,39}$/;

  const AREA_PATTERN = /(관리적|물리적|기술적)/;
  const isHeading = text => text.length <= 60 && /^\s*([□■◆◇▶○●]|[0-9IVX]+[.)]|[가-하][.)])/.test(text);

  function sectionText(cell) {
    // '■ 점검 기준' / '■ 대응 방안' 단위로 나눔
    const out = { criteria: [], remediation: [] };
    let current = 'criteria';
    for (const line of cell.lines) {
      const marker = /^\s*■\s*(.+?)\s*$/.exec(line);
      if (marker) {
        const key = norm(marker[1]);
        if (/대응|조치|보안대책/.test(key)) { current = 'remediation'; continue; }
        if (/점검|판단|기준|방법/.test(key)) { current = 'criteria'; continue; }
      }
      out[current].push(line.trim());
    }
    return { criteria: out.criteria.filter(Boolean).join('\n'), remediation: out.remediation.filter(Boolean).join('\n') };
  }

  function detailTable(table) {
    // 항목 상세 표: 행의 첫 칸이 라벨
    const item = {};
    let afterPlan = false;
    for (const row of table.raw) {
      const labels = row.map(c => norm(cellText(c)).toLowerCase());
      if (row.length === 1) {
        const text = cellText(row[0], '\n');
        if (afterPlan || /■/.test(text)) { Object.assign(item, sectionText(row[0])); afterPlan = false; }
        else if (norm(text) === '점검및대응방안' || norm(text) === '점검및조치방안') afterPlan = true;
        continue;
      }
      afterPlan = false;
      labels.forEach((label, i) => {
        const value = row[i + 1];
        if (!value) return;
        if (label === '평가항목id' || label === '항목id') item.id = cellText(value);
        else if (label === '위험도' || label === '중요도' || label === '등급') item.level = cellText(value);
        else if ((label === '평가항목' || label === '항목명') && i === 0) item.name = cellText(value);
        else if ((label === '점검내용' || label === '설명') && i === 0) item.content = cellText(value, '\n');
        else if (label === '조치시영향' && i === 0) item.impact = cellText(value, '\n');
        else if ((label === '판단기준' || label === '점검기준') && i === 0) item.criteria = cellText(value, '\n');
        else if ((label === '대응방안' || label === '조치방안') && i === 0) item.remediation = cellText(value, '\n');
      });
    }
    return item;
  }
  const isDetailTable = table => table.raw.some(row => ['평가항목id', '항목id'].includes(norm(cellText(row[0])).toLowerCase()));

  function headerTable(table) {
    const columns = {};
    (table.grid[0] || []).forEach((cell, i) => {
      const found = fieldOfHeader(cellText(cell));
      if (found && (!columns[found.field] || found.rank < columns[found.field].rank)) columns[found.field] = { index: i, rank: found.rank };
    });
    if (!columns.id || !columns.name) return null;
    const rows = [];
    for (const row of table.grid.slice(1)) {
      const item = {};
      for (const [field, { index }] of Object.entries(columns)) {
        const text = cellText(row[index], ['content', 'criteria', 'remediation', 'impact'].includes(field) ? '\n' : ' ');
        if (text) item[field] = text;
      }
      if (item.id && ID_PATTERN.test(item.id) && item.name) rows.push(item);
    }
    return rows;
  }

  function guessMeta(blocks, fileName) {
    const paragraphs = blocks.filter(b => b.type === 'p').map(b => b.text.replace(PICTURE, '').trim()).filter(Boolean);
    const title = paragraphs.find(p => /[가-힣A-Za-z]{2}/.test(p)) || fileName;
    const hint = title + ' ' + fileName;
    const year = /(20\d{2})/.exec(hint)?.[1] || '';
    const version = /(제\s?\d{4}\s?-\s?\d+\s?호)/.exec(hint)?.[1].replace(/\s/g, '') || '';
    const dateLine = paragraphs.slice(0, 8).find(p => /^\s*20\d{2}\s*[.\-년]\s*\d{1,2}/.test(p));
    const date = dateLine ? dateLine.replace(/^\s*(20\d{2})\s*[.\-년]\s*(\d{1,2}).*$/, (_, y, m) => `${y}-${m.padStart(2, '0')}`) : '';
    const family = /전자금융/.test(hint) ? '전자금융기반시설' : /주요정보통신기반시설/.test(hint) ? '주요정보통신기반시설' : '기관 내부 기준';
    return { family, year, version, date, source: fileName, title };
  }

  // blocks → { meta, items, warnings }
  function itemsFromBlocks(blocks, fileName) {
    const items = new Map(), warnings = [], pages = new Map();
    let area = '', target = '', areaFound = false, pictures = 0;
    const add = (found, context, fromDetail) => {
      let id = found.id.trim();
      if (fromDetail && !items.has(id) && found.name) {
        // 상세 표의 항목ID가 목록 표와 다를 때(예: 번호 누락) 항목명이 같은 항목에 합칩니다.
        const sameName = [...items.values()].find(i => norm(i.name) === norm(found.name) && !i.content);
        if (sameName) {
          warnings.push(`상세 표의 항목ID '${id}'가 목록 표에 없어, 항목명이 같은 ${sameName.id}(${sameName.name})에 합쳤습니다. 원문의 항목ID를 확인하세요.`);
          id = sameName.id;
          found = { ...found, id };
        }
      }
      const existing = items.get(id);
      const merged = { area: context.area, target: context.target, ...existing, ...Object.fromEntries(Object.entries(found).filter(([, v]) => v)) };
      if (existing?.level && found.level && existing.level !== found.level) warnings.push(`${id}: 목록 표의 등급(${existing.level})과 상세 표의 등급(${found.level})이 다릅니다. 상세 표 값을 썼습니다.`);
      items.set(id, merged);
    };
    for (const block of blocks) {
      if (block.type === 'p') {
        const text = block.text.trim();
        const toc = /^\s*(\S+)\s.*\t\s*(\d{1,4})\s*$/.exec(block.text);
        if (toc && ID_PATTERN.test(toc[1])) pages.set(toc[1], 'p. ' + toc[2]);
        if (isHeading(text) && AREA_PATTERN.test(text)) { area = AREA_PATTERN.exec(text)[1]; target = ''; areaFound = true; }
        else if (/^\s*[가-하][.)]\s*\S/.test(text) && text.length <= 40) target = text.replace(/^\s*[가-하][.)]\s*/, '').trim();
        continue;
      }
      pictures += block.raw.flat().reduce((n, c) => n + c.lines.filter(l => l.includes(PICTURE)).length, 0);
      if (isDetailTable(block)) {
        const found = detailTable(block);
        if (found.id) add(found, { area, target }, true);
        continue;
      }
      const rows = headerTable(block);
      if (rows) for (const row of rows) add(row, { area, target }, false);
    }
    const list = [...items.values()].map(item => ({
      id: item.id, area: AREA_PATTERN.exec(item.area || '')?.[1] || area || '기술적', target: item.target || '',
      category: item.category || '', name: item.name || '', level: (item.level || '').trim(),
      content: item.content || '', criteria: item.criteria || '', remediation: item.remediation || '', impact: item.impact || '',
      ref: item.ref || pages.get(item.id) || '', note: ''
    }));
    const meta = guessMeta(blocks, fileName);
    const levels = new Set(list.map(i => i.level));
    meta.scoring = [...levels].every(l => ['상', '중', '하'].includes(l)) ? 'grade3' : 'risk5';
    if (!list.length) warnings.push('항목 표를 찾지 못했습니다. 첫 행에 항목ID·항목명 같은 머리글이 있는 표인지 확인하세요.');
    if (list.length && !areaFound) warnings.push("문서에서 영역(관리적·물리적·기술적) 제목을 찾지 못해 모두 '기술적'으로 두었습니다.");
    const noLevel = list.filter(i => !i.level).map(i => i.id);
    if (noLevel.length) warnings.push(`등급이 비어 있는 항목 ${noLevel.length}개: ${noLevel.slice(0, 10).join(', ')}${noLevel.length > 10 ? ' …' : ''}`);
    if (pictures) warnings.push(`그림 ${pictures}개는 글자로 옮기지 못해 '${PICTURE}'로 표시했습니다.`);
    return { meta, items: list, warnings };
  }

  // File → 문단·표 블록 목록
  async function readBlocks(file) {
    const buffer = await file.arrayBuffer();
    let zip;
    try { zip = app.zip.readZip(buffer); } catch { throw new Error('docx 또는 hwpx 파일이 아닙니다. 한글 문서는 hwpx로, PDF는 Word로 저장한 뒤 넣으세요.'); }
    if (zip.has('word/document.xml')) return docxBlocks(zip);
    if (zip.names.some(n => /^Contents\/section\d+\.xml$/.test(n))) return hwpxBlocks(zip);
    throw new Error('docx 또는 hwpx 파일이 아닙니다. 한글 문서는 hwpx로, PDF는 Word로 저장한 뒤 넣으세요.');
  }

  // File → { meta, items, warnings }
  const convertDocument = async file => itemsFromBlocks(await readBlocks(file), file.name);

  app.documents = { convertDocument, readBlocks, itemsFromBlocks, PICTURE };
})(window.SecurityChecklist = window.SecurityChecklist || {});
