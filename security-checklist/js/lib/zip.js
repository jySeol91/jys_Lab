// ZIP 읽기·쓰기 (docx, hwpx, xlsx 용). 외부 라이브러리 없이 브라우저 기본 기능만 씁니다.
// - 읽기: 저장(0)·deflate(8) 방식. deflate 는 DecompressionStream('deflate-raw') 사용.
// - 쓰기: 저장(0) 방식. 엑셀과 한글이 그대로 엽니다.
(function (app) {
  'use strict';

  const SIG_EOCD = 0x06054b50, SIG_CENTRAL = 0x02014b50, SIG_LOCAL = 0x04034b50;
  const utf8 = new TextDecoder('utf-8');
  const encoder = new TextEncoder();

  const fail = message => { throw new Error(message); };

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') fail('이 브라우저는 압축 해제를 지원하지 않습니다. 최신 Chrome, Edge, Firefox, Safari를 사용하세요.');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  // ArrayBuffer → { names: [...], has(name), bytes(name), text(name) }
  function readZip(buffer) {
    const view = new DataView(buffer), bytes = new Uint8Array(buffer);
    if (bytes.length < 22) fail('압축 파일 형식이 아닙니다.');
    let eocd = -1;
    for (let i = bytes.length - 22, stop = Math.max(0, bytes.length - 22 - 65535); i >= stop; i--) {
      if (view.getUint32(i, true) === SIG_EOCD) { eocd = i; break; }
    }
    if (eocd < 0) fail('압축 파일 형식이 아닙니다.');
    const count = view.getUint16(eocd + 10, true);
    let pos = view.getUint32(eocd + 16, true);
    const entries = new Map();
    for (let n = 0; n < count; n++) {
      if (view.getUint32(pos, true) !== SIG_CENTRAL) fail('압축 파일 목록이 손상되었습니다.');
      const method = view.getUint16(pos + 10, true);
      const compressedSize = view.getUint32(pos + 20, true);
      const nameLength = view.getUint16(pos + 28, true), extraLength = view.getUint16(pos + 30, true), commentLength = view.getUint16(pos + 32, true);
      const offset = view.getUint32(pos + 42, true);
      const name = utf8.decode(bytes.subarray(pos + 46, pos + 46 + nameLength));
      entries.set(name, { method, compressedSize, offset });
      pos += 46 + nameLength + extraLength + commentLength;
    }

    async function entryBytes(name) {
      const entry = entries.get(name);
      if (!entry) fail(name + ' 항목이 없습니다.');
      if (view.getUint32(entry.offset, true) !== SIG_LOCAL) fail(name + ' 항목이 손상되었습니다.');
      const start = entry.offset + 30 + view.getUint16(entry.offset + 26, true) + view.getUint16(entry.offset + 28, true);
      const data = bytes.subarray(start, start + entry.compressedSize);
      if (entry.method === 0) return data.slice();
      if (entry.method === 8) return inflateRaw(data);
      return fail(name + ' 항목의 압축 방식(' + entry.method + ')은 지원하지 않습니다.');
    }

    return {
      names: [...entries.keys()],
      has: name => entries.has(name),
      bytes: entryBytes,
      text: async name => utf8.decode(await entryBytes(name))
    };
  }

  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(data) {
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function dosDateTime(date) {
    const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
    const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    return { time, day };
  }

  // files: [{ name, data: string | Uint8Array }] → Blob
  function writeZip(files, mimeType = 'application/zip') {
    const { time, day } = dosDateTime(new Date());
    const chunks = [], central = [];
    let offset = 0;
    for (const file of files) {
      const name = encoder.encode(file.name);
      const data = typeof file.data === 'string' ? encoder.encode(file.data) : file.data;
      const crc = crc32(data);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, SIG_LOCAL, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
      local.setUint16(8, 0, true); local.setUint16(10, time, true); local.setUint16(12, day, true);
      local.setUint32(14, crc, true); local.setUint32(18, data.length, true); local.setUint32(22, data.length, true);
      local.setUint16(26, name.length, true); local.setUint16(28, 0, true);
      chunks.push(new Uint8Array(local.buffer), name, data);

      const entry = new DataView(new ArrayBuffer(46));
      entry.setUint32(0, SIG_CENTRAL, true); entry.setUint16(4, 20, true); entry.setUint16(6, 20, true); entry.setUint16(8, 0x0800, true);
      entry.setUint16(10, 0, true); entry.setUint16(12, time, true); entry.setUint16(14, day, true);
      entry.setUint32(16, crc, true); entry.setUint32(20, data.length, true); entry.setUint32(24, data.length, true);
      entry.setUint16(28, name.length, true); entry.setUint32(42, offset, true);
      central.push(new Uint8Array(entry.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const centralSize = central.reduce((sum, part) => sum + part.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, SIG_EOCD, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, centralSize, true); end.setUint32(16, offset, true);
    return new Blob([...chunks, ...central, new Uint8Array(end.buffer)], { type: mimeType });
  }

  app.zip = { readZip, writeZip, crc32 };
})(window.SecurityChecklist = window.SecurityChecklist || {});
