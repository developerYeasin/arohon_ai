# DOCX → Unicode text, run by run, so Bijoy-font runs are converted and Unicode/English runs pass through.
# Fonts are resolved run → character style → paragraph style chain → document defaults, like Word does.
import re
import zipfile
import xml.etree.ElementTree as ET
from pagetext import font_kind, PROSHNA, symbol_char, symbol_text
from bijoy import bijoy_to_unicode

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
MC = '{http://schemas.openxmlformats.org/markup-compatibility/2006}'
M = '{http://schemas.openxmlformats.org/officeDocument/2006/math}'
BANGLA = re.compile('[ঀ-৿]')


def _fonts_of(rpr):
    if rpr is None:
        return None
    f = rpr.find(W + 'rFonts')
    if f is None:
        return None
    return f.get(W + 'ascii') or f.get(W + 'hAnsi') or f.get(W + 'cs')


class Styles:
    def __init__(self, z):
        self.font, self.based, self.default_para = {}, {}, None
        self.doc_default = None
        self.numbering = None
        try:
            root = ET.fromstring(z.read('word/styles.xml'))
        except KeyError:
            return
        dd = root.find(f'{W}docDefaults/{W}rPrDefault/{W}rPr')
        self.doc_default = _fonts_of(dd)
        for s in root.findall(W + 'style'):
            sid = s.get(W + 'styleId')
            self.font[sid] = _fonts_of(s.find(W + 'rPr'))
            b = s.find(W + 'basedOn')
            if b is not None:
                self.based[sid] = b.get(W + 'val')
            if s.get(W + 'type') == 'paragraph' and s.get(W + 'default') == '1':
                self.default_para = sid

    def resolve(self, sid):
        seen = set()
        while sid and sid not in seen:
            seen.add(sid)
            if self.font.get(sid):
                return self.font[sid]
            sid = self.based.get(sid)
        return None


def _roman(n):
    out = ''
    for v, s in ((1000, 'm'), (900, 'cm'), (500, 'd'), (400, 'cd'), (100, 'c'), (90, 'xc'), (50, 'l'), (40, 'xl'),
                 (10, 'x'), (9, 'ix'), (5, 'v'), (4, 'iv'), (1, 'i')):
        while n >= v:
            out += s; n -= v
    return out


class Numbering:
    """Word list numbering (numbering.xml): questions are often numbered by the list, not in the text."""

    def __init__(self, z):
        self.levels, self.nums, self.counters = {}, {}, {}
        try:
            root = ET.fromstring(z.read('word/numbering.xml'))
        except KeyError:
            return
        for a in root.findall(W + 'abstractNum'):
            lv = {}
            for l in a.findall(W + 'lvl'):
                fmt = l.find(W + 'numFmt'); txt = l.find(W + 'lvlText'); st = l.find(W + 'start')
                lv[int(l.get(W + 'ilvl'))] = (fmt.get(W + 'val') if fmt is not None else 'decimal',
                                             txt.get(W + 'val') if txt is not None else '%1.',
                                             int(st.get(W + 'val')) if st is not None else 1)
            self.levels[a.get(W + 'abstractNumId')] = lv
        for n in root.findall(W + 'num'):
            a = n.find(W + 'abstractNumId')
            over = {}
            for o in n.findall(W + 'lvlOverride'):
                so = o.find(W + 'startOverride')
                if so is not None:
                    over[int(o.get(W + 'ilvl'))] = int(so.get(W + 'val'))
            self.nums[n.get(W + 'numId')] = (a.get(W + 'val') if a is not None else None, over)

    def label(self, num_id, ilvl):
        if num_id in (None, '0') or num_id not in self.nums:
            return ''
        abstract, over = self.nums[num_id]
        lv = self.levels.get(abstract, {})
        if ilvl not in lv:
            return ''
        c = self.counters.setdefault(num_id, [None] * 9)
        start = over.get(ilvl, lv[ilvl][2])
        c[ilvl] = start if c[ilvl] is None else c[ilvl] + 1
        for deeper in range(ilvl + 1, 9):
            c[deeper] = None
        fmt, text, _ = lv[ilvl]
        if fmt in ('bullet', 'none'):
            return ''

        def show(k):
            f = lv.get(k, ('decimal',))[0]
            v = c[k] if c[k] is not None else lv.get(k, (0, 0, 1))[2]
            if f == 'lowerLetter':
                return chr(96 + (v - 1) % 26 + 1)
            if f == 'upperLetter':
                return chr(64 + (v - 1) % 26 + 1)
            if f == 'lowerRoman':
                return _roman(v)
            if f == 'upperRoman':
                return _roman(v).upper()
            return str(v)
        return re.sub(r'%(\d)', lambda m: show(int(m.group(1)) - 1), text).strip() + ' '


def convert(text, font):
    kind = font_kind(font or '')
    if kind == 'bijoy' and not BANGLA.search(text):
        return bijoy_to_unicode(text)
    if kind == 'proshna':
        return ''.join(PROSHNA.get(ch, ch) for ch in text)
    if kind == 'symbol':
        return symbol_text(text, font)
    return text


def _para_text(p, styles, stats):
    ppr = p.find(W + 'pPr')
    pstyle = None
    if ppr is not None and ppr.find(W + 'pStyle') is not None:
        pstyle = ppr.find(W + 'pStyle').get(W + 'val')
    pfont = styles.resolve(pstyle or styles.default_para) or styles.doc_default
    out = []
    numpr = ppr.find(W + 'numPr') if ppr is not None else None
    if numpr is not None and styles.numbering is not None:
        nid, lvl = numpr.find(W + 'numId'), numpr.find(W + 'ilvl')
        out.append(styles.numbering.label(nid.get(W + 'val') if nid is not None else None,
                                          int(lvl.get(W + 'val')) if lvl is not None else 0))
    # group consecutive text of the same font so Bijoy reordering sees whole words
    buf, buf_font = [], None

    def flush():
        nonlocal buf, buf_font
        if buf:
            t = ''.join(buf)
            stats[font_kind(buf_font or '')] = stats.get(font_kind(buf_font or ''), 0) + len(t.strip())
            out.append(convert(t, buf_font))
        buf, buf_font = [], None

    def walk(el):
        nonlocal buf_font
        for ch in el:
            tag = ch.tag
            if tag == MC + 'AlternateContent':
                choice = ch.find(MC + 'Choice')
                if choice is not None:
                    walk(choice)
                continue
            if tag == W + 'r':
                rpr = ch.find(W + 'rPr')
                font = _fonts_of(rpr)
                if font is None and rpr is not None and rpr.find(W + 'rStyle') is not None:
                    font = styles.resolve(rpr.find(W + 'rStyle').get(W + 'val'))
                font = font or pfont
                for rc in ch:
                    if rc.tag == W + 't':
                        if buf and font != buf_font:
                            flush()
                        buf_font = font
                        buf.append(rc.text or '')
                    elif rc.tag == W + 'tab':
                        buf.append(' ')
                    elif rc.tag in (W + 'br', W + 'cr'):
                        flush(); out.append('\n')
                    elif rc.tag == W + 'sym':
                        sf = rc.get(W + 'font') or ''
                        code = rc.get(W + 'char') or ''
                        if code:
                            flush()
                            c = int(code, 16)
                            if font_kind(sf) == 'proshna':
                                out.append(PROSHNA.get(chr(c & 0xFF), ''))
                            elif font_kind(sf) == 'symbol':
                                out.append(symbol_char(c, sf))
                            elif font_kind(sf) == 'bijoy':
                                out.append(bijoy_to_unicode(chr(c & 0xFF)))
                    elif rc.tag == MC + 'AlternateContent' or rc.tag.endswith('}drawing') or rc.tag.endswith('}pict'):
                        flush()
                        stats['images'] = stats.get('images', 0) + (0 if rc.tag == MC + 'AlternateContent' else 1)
                        # text boxes live inside drawings; keep their text in reading order
                        for tb in rc.iter(W + 'txbxContent'):
                            if _inside_fallback(rc, tb):
                                continue
                            for tp in tb.findall(W + 'p'):
                                out.append('\n' + _para_text(tp, styles, stats) + '\n')
                    elif rc.tag == W + 'fldChar' or rc.tag == W + 'instrText':
                        continue
            elif tag == M + 'oMath' or tag == M + 'oMathPara':
                flush()
                out.append(''.join(t.text or '' for t in ch.iter(M + 't')))
            elif tag in (W + 'hyperlink', W + 'smartTag', W + 'ins', W + 'sdt', W + 'sdtContent', W + 'fldSimple'):
                walk(ch)
        flush()

    walk(p)
    return re.sub(r'[ \t ]+', ' ', ''.join(out)).strip()


def _inside_fallback(root, target):
    # a text box has a VML copy under mc:Fallback; skip it so the text is not read twice
    parents = {c: p for p in root.iter() for c in p}
    n = target
    while n in parents:
        n = parents[n]
        if n.tag == MC + 'Fallback':
            return True
    return False


def _body_text(el, styles, stats, lines):
    for ch in el:
        if ch.tag == W + 'p':
            lines.append(_para_text(ch, styles, stats))
        elif ch.tag == W + 'tbl':
            for tr in ch.findall(W + 'tr'):
                cells = []
                for tc in tr.findall(W + 'tc'):
                    sub = []
                    _body_text(tc, styles, stats, sub)
                    cells.append(' '.join(s for s in sub if s))
                lines.append(' | '.join(cells))
        elif ch.tag in (W + 'sdt', W + 'sdtContent', W + 'customXml'):
            _body_text(ch, styles, stats, lines)


def docx_text(path):
    with zipfile.ZipFile(path) as z:
        styles = Styles(z)
        styles.numbering = Numbering(z)
        root = ET.fromstring(z.read('word/document.xml'))
    stats, lines = {}, []
    _body_text(root.find(W + 'body'), styles, stats, lines)
    text = re.sub(r'\n{3,}', '\n\n', '\n'.join(lines)).strip()
    return text, stats


if __name__ == '__main__':
    import sys
    sys.stdout.reconfigure(encoding='utf-8')
    t, st = docx_text(sys.argv[1])
    print(st)
    print(t[: int(sys.argv[2]) if len(sys.argv) > 2 else 4000])
