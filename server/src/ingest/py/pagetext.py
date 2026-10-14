# Page → Unicode text, font by font: Bijoy (…MJ) spans are converted, Unicode and English spans pass through,
# and the ProshnaP option-bullet font becomes (ক)…(ঘ), with filled bullets (the marked answer) as [উ: ক].
import re
import pymupdf
from bijoy import bijoy_to_unicode

PROSHNA = {'K': '(ক)', 'L': '(খ)', 'M': '(গ)', 'N': '(ঘ)', 'O': '(ঙ)',
           'P': '[উ: ক]', 'Q': '[উ: খ]', 'R': '[উ: গ]', 'S': '[উ: ঘ]', 'T': '[উ: ঙ]'}
SYMBOL_FONTS = ('wingding', 'webding', 'symbol')
BANGLA = re.compile('[ঀ-৿]')
# Books mark the correct option by drawing a filled circle / tick (Wingdings) in place of its letter;
# every Wingdings-family glyph becomes this sign and the parser decides whether it stands for an answer.
MARK = '◉'
# Adobe Symbol encoding for the codes used in maths/science text
SYMBOL_MAP = {
    0x22: '∀', 0x24: '∃', 0x27: '∋', 0x2A: '∗', 0x2D: '−', 0x40: '≅', 0x41: 'Α', 0x42: 'Β', 0x43: 'Χ', 0x44: 'Δ', 0x45: 'Ε',
    0x46: 'Φ', 0x47: 'Γ', 0x48: 'Η', 0x49: 'Ι', 0x4B: 'Κ', 0x4C: 'Λ', 0x4D: 'Μ', 0x4E: 'Ν', 0x4F: 'Ο', 0x50: 'Π', 0x51: 'Θ',
    0x52: 'Ρ', 0x53: 'Σ', 0x54: 'Τ', 0x55: 'Υ', 0x57: 'Ω', 0x58: 'Ξ', 0x59: 'Ψ', 0x5A: 'Ζ', 0x5C: '∴', 0x5E: '⊥',
    0x61: 'α', 0x62: 'β', 0x63: 'χ', 0x64: 'δ', 0x65: 'ε', 0x66: 'φ', 0x67: 'γ', 0x68: 'η', 0x69: 'ι', 0x6A: 'ϕ', 0x6B: 'κ',
    0x6C: 'λ', 0x6D: 'μ', 0x6E: 'ν', 0x6F: 'ο', 0x70: 'π', 0x71: 'θ', 0x72: 'ρ', 0x73: 'σ', 0x74: 'τ', 0x75: 'υ', 0x76: 'ϖ',
    0x77: 'ω', 0x78: 'ξ', 0x79: 'ψ', 0x7A: 'ζ', 0x7E: '∼', 0xA2: '′', 0xA3: '≤', 0xA5: '∞', 0xA7: '♣', 0xAB: '↔', 0xAC: '←',
    0xAD: '↑', 0xAE: '→', 0xAF: '↓', 0xB0: '°', 0xB1: '±', 0xB2: '″', 0xB3: '≥', 0xB4: '×', 0xB5: '∝', 0xB6: '∂', 0xB7: '•',
    0xB8: '÷', 0xB9: '≠', 0xBA: '≡', 0xBB: '≈', 0xBC: '…', 0xC4: '⊗', 0xC5: '⊕', 0xC6: '∅', 0xC7: '∩', 0xC8: '∪', 0xC9: '⊃',
    0xCA: '⊇', 0xCB: '⊄', 0xCC: '⊂', 0xCD: '⊆', 0xCE: '∈', 0xCF: '∉', 0xD0: '∠', 0xD1: '∇', 0xD5: '∏', 0xD6: '√', 0xD7: '·',
    0xD8: '¬', 0xD9: '∧', 0xDA: '∨', 0xDB: '⇔', 0xDC: '⇐', 0xDD: '⇑', 0xDE: '⇒', 0xDF: '⇓', 0xE0: '◊', 0xE5: '∑', 0xF2: '∫',
}


def symbol_char(code, font):
    """A glyph from a symbol font (by its 8-bit code) → Unicode text."""
    f = font.lower()
    if f.startswith(('wingding', 'webding')):
        return MARK
    code &= 0xFF
    if code in SYMBOL_MAP:
        return SYMBOL_MAP[code]
    return chr(code) if 0x20 <= code < 0x7F else ''


def symbol_text(t, font):
    out = []
    for ch in t:
        o = ord(ch)
        if ch.isspace():
            out.append(ch)
        elif 0xF000 <= o <= 0xF0FF or o < 0x100:
            out.append(symbol_char(o, font))
        else:
            out.append(MARK if font.lower().startswith(('wingding', 'webding')) else ch)  # already Unicode (SymbolMT)
    return ''.join(out)


def font_kind(font):
    f = re.sub(r'^[A-Z]{6}\+', '', font).lower()
    if f.startswith('proshna'):
        return 'proshna'
    if f.startswith('sutonnyomj'):  # SutonnyOMJ is the Unicode build of Sutonny
        return 'text'
    if 'mj' in f or f.startswith(('sutonny', 'sabrena', 'kongsho', 'karnaphuli', 'saroda')):
        return 'bijoy'
    if f.startswith(SYMBOL_FONTS):
        return 'symbol'
    return 'text'


def span_text(span):
    t = span['text']
    kind = font_kind(span['font'])
    if kind == 'bijoy' and not BANGLA.search(t):
        return bijoy_to_unicode(t)
    if kind == 'proshna':
        return ''.join(PROSHNA.get(ch, ch) for ch in t)
    if kind == 'symbol':
        return symbol_text(t, re.sub(r'^[A-Z]{6}\+', '', span['font']))
    return t


_KAR = 'া-ৄেৈোৌৗ'
# sequences that never occur in real Bangla: two vowel signs in a row, a vowel sign opening a word,
# a sign after ং/ঃ. PDFs whose font maps glyphs to the wrong code points ("সমাধান" → "সিাধাি") are full of them.
_INVALID = re.compile(f'[{_KAR}][{_KAR}]|(?:^|(?<=[\\s(\\[“‘"\']))[{_KAR}]|[ংঃ][{_KAR}]', re.M)


def garble_score(text):
    """Share of Bangla characters that sit in an impossible sequence; readable text scores near 0."""
    bn = len(BANGLA.findall(text))
    if bn < 80:
        return 0.0
    return len(_INVALID.findall(text)) / bn


def page_text(page):
    """Returns (text, stats) where stats counts characters by source kind, used to spot pages without a text layer."""
    stats = {'bijoy': 0, 'text': 0, 'proshna': 0, 'symbol': 0}
    lines = []
    d = page.get_text('dict', sort=False)
    for b in d['blocks']:
        if b.get('type') != 0:
            continue
        for l in b['lines']:
            parts = []
            for s in l['spans']:
                stats[font_kind(s['font'])] += len(s['text'].strip())
                parts.append(span_text(s))
            line = re.sub(r'[ \t ]+', ' ', ''.join(parts)).strip()
            if line:
                lines.append(line)
        lines.append('')
    text = re.sub(r'\n{3,}', '\n\n', '\n'.join(lines)).strip()
    return text, stats


if __name__ == '__main__':
    import sys
    sys.stdout.reconfigure(encoding='utf-8')
    doc = pymupdf.open(sys.argv[1])
    for n in sys.argv[2:]:
        t, st = page_text(doc[int(n) - 1])
        print(f'===== page {n} {st}\n{t}')
