"""테스트용 예시 파일을 만듭니다. 내용은 모두 가상입니다.

    python3 tests/fixtures/make_fixtures.py

- sample-guide.docx    : 목록 표 + 항목 상세 표 형식의 Word 문서(글상자 중복본, 그림, 항목ID 누락, 빈 양식 표 포함)
- sample-checklist.hwpx: '□ 관리적 분야', '가. 유닉스' 같은 제목과 세로 병합 칸이 있는 한글 문서
- example-annex4.xlsx  : [붙임4] 점수 계산 예제와 같은 구성의 기준 양식(엑셀처럼 공유 문자열·압축 사용)
"""
import os
import zipfile
from xml.sax.saxutils import escape

HERE = os.path.dirname(os.path.abspath(__file__))


def write_zip(name, files, stored_first=None):
    with zipfile.ZipFile(os.path.join(HERE, name), 'w', zipfile.ZIP_DEFLATED) as z:
        if stored_first:
            z.writestr(zipfile.ZipInfo(stored_first[0], (2026, 1, 1, 0, 0, 0)), stored_first[1], zipfile.ZIP_STORED)
        for path, data in files:
            info = zipfile.ZipInfo(path, (2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, data)


# ── docx ────────────────────────────────────────────────────
W_NS = ('xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
        'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" '
        'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" '
        'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
        'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
        'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" '
        'xmlns:v="urn:schemas-microsoft-com:vml" mc:Ignorable="wps"')

PICTURE = ('<w:r><w:drawing><wp:inline><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
           '<pic:pic/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>')


def run(text):
    return f'<w:r><w:t xml:space="preserve">{escape(text)}</w:t></w:r>'


def para(*parts):
    return '<w:p>' + ''.join(parts) + '</w:p>'


def textbox(lines):
    inner = ''.join(para(run(t)) for t in lines)
    return ('<w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing><wp:anchor><a:graphic><a:graphicData>'
            f'<wps:wsp><wps:txbx><w:txbxContent>{inner}</w:txbxContent></wps:txbx></wps:wsp>'
            '</a:graphicData></a:graphic></wp:anchor></w:drawing></mc:Choice>'
            f'<mc:Fallback><w:pict><v:shape><v:textbox><w:txbxContent>{inner}</w:txbxContent></v:textbox></v:shape></w:pict></mc:Fallback>'
            '</mc:AlternateContent></w:r>')


def cell(content, span=1, vmerge=None):
    pr = ''
    if span > 1:
        pr += f'<w:gridSpan w:val="{span}"/>'
    if vmerge == 'restart':
        pr += '<w:vMerge w:val="restart"/>'
    elif vmerge == 'continue':
        pr += '<w:vMerge/>'
    body = content if content.startswith('<w:p>') else para(run(content)) if content else '<w:p/>'
    return f'<w:tc><w:tcPr>{pr}</w:tcPr>{body}</w:tc>'


def table(rows):
    return '<w:tbl>' + ''.join('<w:tr>' + ''.join(r) + '</w:tr>' for r in rows) + '</w:tbl>'


def detail(item_id, level, name, content, criteria, remediation_parts, impact='일반적인 경우 영향 없음'):
    plan = para(run('■ 점검 기준')) + ''.join(para(run(c)) for c in criteria) + para(run('■ 대응 방안')) + ''.join(remediation_parts)
    return table([
        [cell('평가항목ID'), cell(item_id), cell('위험도'), cell(level)],
        [cell('평가항목'), cell(name, 3)],
        [cell('점검 내용'), cell(content, 3)],
        [cell('점검 및 대응 방안', 4)],
        [cell(plan, 4)],
        [cell('조치 시 영향'), cell(impact, 3)],
    ])


def make_docx():
    body = ''.join([
        para(PICTURE),
        para(run('예시금융 웹 점검 기준(제2026-1호) 대응 방안')),
        para(run('2026. 03.')),
        para(run('목 차')),
        para('<w:r><w:tab/></w:r>', run('TST-001 계정 잠금 설정'), '<w:r><w:tab/></w:r>', run('5')),
        para('<w:r><w:tab/></w:r>', run('TST-002 관리자 페이지 노출'), '<w:r><w:tab/></w:r>', run('6')),
        para('<w:r><w:tab/></w:r>', run('TST-003 세션 만료 설정'), '<w:r><w:tab/></w:r>', run('7')),
        para(run('1. 점검항목')),
        table([
            [cell('분류'), cell('번호'), cell('항목 명'), cell('위험도')],
            [cell('인증', vmerge='restart'), cell('TST-001'), cell('계정 잠금 설정'), cell('5')],
            [cell('', vmerge='continue'), cell('TST-002'), cell('관리자 페이지 노출'), cell('4')],
            [cell('세션'), cell('TST-003'), cell('세션 만료 설정'), cell('3')],
        ]),
        para(run('2. 대응 방안')),
        para(run('TST-001 계정 잠금 설정')),
        detail('TST-001', '5', '계정 잠금 설정', '인증 실패 횟수 제한 여부를 점검',
               ['- 5회 연속 실패 후 계정이 잠기는지 확인'],
               [para(run('- 5회 초과 실패 시 계정 잠금')), para(textbox(['MaxAuthTries 5', 'LockoutDuration 30']))]),
        para(run('TST-002 관리자 페이지 노출')),
        detail('TST-', '4', '관리자 페이지 노출', '관리자 페이지가 외부에 노출되는지 점검',
               ['- 외부망에서 /admin 접근 가능 여부 확인'],
               [para(run('- 관리자 페이지는 내부망에서만 접근')), para(PICTURE)]),
        para(run('TST-003 세션 만료 설정')),
        detail('TST-003', '3', '세션 만료 설정', '일정 시간 뒤 세션이 끝나는지 점검',
               ['- 10분 동안 입력이 없으면 로그아웃되는지 확인'],
               [para(run('- 세션 타임아웃 10분 설정'))]),
        detail('', '', '', '', [], []),
    ])
    document = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document {W_NS}><w:body>{body}</w:body></w:document>'
    types = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
             '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
             '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
    rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
    write_zip('sample-guide.docx', [('[Content_Types].xml', types), ('_rels/.rels', rels), ('word/document.xml', document)])


# ── hwpx ────────────────────────────────────────────────────
def hcell(text, row, col, rows=1):
    return (f'<hp:tc><hp:subList><hp:p><hp:run><hp:t>{escape(text)}</hp:t></hp:run></hp:p></hp:subList>'
            f'<hp:cellAddr colAddr="{col}" rowAddr="{row}"/><hp:cellSpan colSpan="1" rowSpan="{rows}"/></hp:tc>')


def htable(rows):
    return '<hp:tbl>' + ''.join('<hp:tr>' + ''.join(r) + '</hp:tr>' for r in rows) + '</hp:tbl>'


def hpara(text='', table_xml=''):
    runs = (f'<hp:run>{table_xml}</hp:run>' if table_xml else '') + (f'<hp:run><hp:t>{escape(text)}</hp:t></hp:run>' if text else '')
    return f'<hp:p>{runs}</hp:p>'


def make_hwpx():
    header = lambda labels: [hcell(t, 0, i) for i, t in enumerate(labels)]
    mgmt = htable([header(['분류', '번호', '취약점 점검 항목', '등급']),
                   [hcell('정책', 1, 0, rows=2), hcell('A-1', 1, 1), hcell('보안 정책 수립', 1, 2), hcell('상', 1, 3)],
                   [hcell('A-2', 2, 1), hcell('정책 정기 검토', 2, 2), hcell('중', 2, 3)]])
    unix = htable([header(['분류', '번호', '취약점 점검 항목', '등급']),
                   [hcell('계정 관리', 1, 0, rows=2), hcell('U-1', 1, 1), hcell('root 계정 원격 접속 제한', 1, 2), hcell('상', 1, 3)],
                   [hcell('U-2', 2, 1), hcell('비밀번호 관리정책 설정', 2, 2), hcell('중', 2, 3)]])
    web = htable([header(['코드', '취약점명', '설 명', '등급']),
                  [hcell('SI', 1, 0), hcell('SQL 인젝션', 1, 1), hcell('입력값이 쿼리에 그대로 들어가는지 확인', 1, 2), hcell('상', 1, 3)]])
    section = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
               '<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">'
               + hpara('[붙임] 예시 점검항목') + hpara('□ 관리적 분야') + hpara(table_xml=mgmt)
               + hpara('□ 기술적 분야') + hpara('  가. 유닉스 ', unix) + hpara('나. 웹 서비스') + hpara(table_xml=web) + '</hs:sec>')
    write_zip('sample-checklist.hwpx', [('Contents/section0.xml', section)], stored_first=('mimetype', 'application/hwp+zip'))


# ── xlsx ([붙임4] 예제) ─────────────────────────────────────
def make_xlsx():
    shared, index = [], {}

    def s(text):
        if text not in index:
            index[text] = len(shared)
            shared.append(text)
        return index[text]

    def col(i):
        return chr(65 + i)

    def sheet(rows):
        out = []
        for r, row in enumerate(rows, 1):
            cells = []
            for c, value in enumerate(row):
                ref = f'{col(c)}{r}'
                if isinstance(value, (int, float)):
                    cells.append(f'<c r="{ref}"><v>{value}</v></c>')
                elif value:
                    cells.append(f'<c r="{ref}" t="s"><v>{s(value)}</v></c>')
            out.append(f'<row r="{r}">{"".join(cells)}</row>')
        return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
                f'<sheetData>{"".join(out)}</sheetData></worksheet>')

    meta = [['항목', '값'], ['기준 계열', '예시 기준(붙임4 예제)'], ['연도', 2026], ['버전·고시 번호', '붙임4-예제'],
            ['시행일 또는 게시일', 45992], ['출처', 'https://www.law.go.kr/LSW/flDownload.do?flSeq=159837663'], ['배점 방식', '중요도 상·중·하']]
    header = ['항목ID', '영역', '대상 유형', '분류', '항목명', '등급', '점검 내용', '판단 기준', '대응 방안', '조치 시 영향', '원문 위치', '비고']
    items = [header]
    items += [[f'M-{i:02d}', '관리적', '', '관리', f'관리 항목 {i}', '상'] for i in range(1, 11)]
    items += [[f'P-{i:02d}', '물리적', '', '물리', f'물리 항목 {i}', '상'] for i in range(1, 6)]
    tech = [('시스템 정보 노출', '상'), ('추측가능한 패스워드 사용', '상'), ('패스워드가 없는 계정 존재', '상'), ('Guest 계정 존재', '상'),
            ('불필요한 서비스 활성화', '상'), ('Anonymous FTP 활성화', '상'), ('쓰기 가능한 Anonymous FTP 활성화', '중'),
            ('SMTP expn/vrfy 명령을 통한 시스템 정보 획득 가능', '중'), ('구 버전의 SNMP 사용', '하'), ('쓰기 가능한 공유 폴더 존재', '중')]
    items += [[f'T-{i:02d}', '기술적', '', '서버', name, level, '', '', f'{name} 조치'] for i, (name, level) in enumerate(tech, 1)]
    sheets = [('기준정보', sheet(meta)), ('점검항목', sheet(items))]
    sst = ''.join(f'<si><t xml:space="preserve">{escape(t)}</t></si>' for t in shared)
    files = [
        ('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
         '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
         '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
         + ''.join(f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' for i in (1, 2))
         + '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>'),
        ('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
         '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
        ('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
         'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
         + ''.join(f'<sheet name="{n}" sheetId="{i}" r:id="rId{i}"/>' for i, (n, _) in enumerate(sheets, 1)) + '</sheets></workbook>'),
        ('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
         + ''.join(f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet{i}.xml"/>' for i in (1, 2))
         + '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>'),
        ('xl/sharedStrings.xml', f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="{len(shared)}" uniqueCount="{len(shared)}">{sst}</sst>'),
    ] + [(f'xl/worksheets/sheet{i}.xml', xml) for i, (_, xml) in enumerate(sheets, 1)]
    write_zip('example-annex4.xlsx', files)


if __name__ == '__main__':
    make_docx()
    make_hwpx()
    make_xlsx()
    print('fixtures written to', HERE)
