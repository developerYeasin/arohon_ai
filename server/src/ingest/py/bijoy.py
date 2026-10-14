# Bijoy (SutonnyMJ family, ANSI-encoded) → Unicode Bangla.
# Glyph table follows the SutonnyMJ layout; entries checked against rendered pages from source_pdf.
import re

# Conversion is two passes: map glyph codes, then move pre-base kars (ি ে ৈ) and reph (র্) to Unicode order.

GLYPHS = {
    # vowels
    'Av': 'আ', 'A': 'অ', 'B': 'ই', 'C': 'ঈ', 'D': 'উ', 'E': 'ঊ', 'F': 'ঋ', 'G': 'এ', 'H': 'ঐ', 'I': 'ও', 'J': 'ঔ',
    # consonants
    'K': 'ক', 'L': 'খ', 'M': 'গ', 'N': 'ঘ', 'O': 'ঙ', 'P': 'চ', 'Q': 'ছ', 'R': 'জ', 'S': 'ঝ', 'T': 'ঞ',
    'U': 'ট', 'V': 'ঠ', 'W': 'ড', 'X': 'ঢ', 'Y': 'ণ', 'Z': 'ত', '_': 'থ', '`': 'দ', 'a': 'ধ', 'b': 'ন',
    'c': 'প', 'd': 'ফ', 'e': 'ব', 'f': 'ভ', 'g': 'ম', 'h': 'য', 'i': 'র', 'j': 'ল', 'k': 'শ', 'l': 'ষ',
    'm': 'স', 'n': 'হ', 'o': 'ড়', 'p': 'ঢ়', 'q': 'য়', 'r': 'ৎ', 's': 'ং', 't': 'ঃ', 'u': 'ঁ',
    # digits
    '0': '০', '1': '১', '2': '২', '3': '৩', '4': '৪', '5': '৫', '6': '৬', '7': '৭', '8': '৮', '9': '৯',
    # kars
    'v': 'া', 'w': 'ি', 'x': 'ী', 'y': 'ু', 'z': 'ু', '“': 'ু', '–': 'ু', 'æ': 'ু',
    '~': 'ূ', 'ƒ': 'ূ', '‚': 'ূ', '„': 'ৃ', '…': 'ৃ', '†': 'ে', '‡': 'ে', 'ˆ': 'ৈ', '‰': 'ৈ', 'Š': 'ৗ',
    '|': '।', '&': '্‌',
    # phala / half forms
    '^': '্ব', '‘': '্তু', '’': '্থ', '‹': '্ক', 'Œ': '্ক্র', '”': 'চ্', '—': '্ত', '˜': 'দ্', '™': 'দ্',
    'š': 'ন্', '›': 'ন্', 'œ': '্ন', 'Ÿ': '্ব', '¡': '্ব', '¢': '্ভ', '£': '্ভ্র', '¤': 'ম্', '¥': '্ম',
    '¦': '্ব', '§': '্ম', '¨': '্য', '©': 'র্', 'ª': '্র', '«': '্র', '¬': '্ল', '­': '্ল', '®': 'ষ্',
    '¯': 'স্', 'Ö': '্র', 'ú': '্প', 'Í': '্ত', '•': 'ঙ্',
    # conjuncts
    '°': 'ক্ক', '±': 'ক্ট', '²': 'ক্ষ্ম', '³': 'ক্ত', '´': 'ক্ম', 'µ': 'ক্র', '¶': 'ক্ষ', '·': 'ক্স', '¸': 'গু',
    '¹': 'জ্ঞ', 'º': 'গ্দ', '»': 'গ্ধ', '¼': 'ঙ্ক', '½': 'ঙ্গ', '¾': 'জ্জ', '¿': '্ত্র', 'À': 'জ্ঝ', 'Á': 'জ্ঞ',
    'Â': 'ঞ্চ', 'Ã': 'ঞ্ছ', 'Ä': 'ঞ্জ', 'Å': 'ঞ্ঝ', 'Æ': 'ট্ট', 'Ç': 'ড্ড', 'È': 'ণ্ট', 'É': 'ণ্ঠ', 'Ê': 'ণ্ড',
    'Ë': 'ত্ত', 'Ì': 'ত্থ', 'Î': 'ত্র', 'Ï': 'দ্দ', '×': 'দ্ধ', 'Ø': 'দ্ব', 'Ù': 'দ্ম', 'Ú': 'ন্ঠ', 'Û': 'ন্ড',
    'Ü': 'ন্ধ', 'Ý': 'ন্স', 'Þ': 'প্ট', 'ß': 'প্ত', 'à': 'প্প', 'á': 'প্স', 'â': 'ব্জ', 'ã': 'ব্দ', 'ä': 'ব্ধ',
    'å': 'ভ্র', 'ç': 'ম্ফ', 'è': '্ন', 'é': 'ল্ক', 'ê': 'ল্গ', 'ë': 'ল্ট', 'ì': 'ল্ড', 'í': 'ল্প', 'î': 'ল্ফ',
    'ï': 'শু', 'ð': 'শ্চ', 'ñ': 'শ্ছ', 'ò': 'ষ্ণ', 'ó': 'ষ্ট', 'ô': 'ষ্ঠ', 'õ': 'ষ্ফ', 'ö': 'স্খ', '÷': 'স্ট',
    'ø': '্ল', 'ÿ': 'ক্ষ', 'ù': 'স্ফ', 'û': 'হু', 'ü': 'হৃ', 'ý': 'হ্ন', 'þ': 'হ্ম',
    # punctuation
    'Ð': '–', 'Ñ': '—', 'Ò': '“', 'Ó': '”', 'Ô': '‘', 'Õ': '’',
}
MAXKEY = max(map(len, GLYPHS))

CONSONANTS = set('কখগঘঙচছজঝঞটঠডঢণতথদধনপফবভমযরলশষসহড়ঢ়য়ৎ')
PRE_KARS = set('িেৈ')
POST_KARS = set('াোৌৗুূীৃ')
KARS = PRE_KARS | POST_KARS
HALANT = '্'
ZWNJ = '‌'
NUKTA = '়'


def _map(s):
    out, i = [], 0
    while i < len(s):
        for n in range(MAXKEY, 0, -1):
            g = GLYPHS.get(s[i:i + n])
            if g is not None:
                out.append(g); i += n; break
        else:
            out.append(s[i]); i += 1
    return ''.join(out).replace(HALANT + HALANT, HALANT)


def _cluster_end(s, i):
    """Index just past the consonant cluster starting at i (C, C্C, C্C্C …, plus ্য/্র/্ব phala)."""
    j = i
    if j < len(s) and s[j] in CONSONANTS:
        j += 1
        if j < len(s) and s[j] == NUKTA:
            j += 1
        while j + 1 < len(s) and s[j] == HALANT and s[j + 1] in CONSONANTS:
            j += 2
            if j < len(s) and s[j] == NUKTA:
                j += 1
    return j


def _reorder(s):
    # a kar typed before a phala belongs after it: স ু ্য → স ্য ু
    s = re.sub('([' + ''.join(KARS) + 'ঁ])(্[যরবলনম])', r'\2\1', s)
    chars = list(s)
    out = []
    i = 0
    n = len(chars)
    while i < n:
        c = chars[i]
        # pre-base kar typed before its consonant cluster: ে + ক্র → ক্র + ে (and ে…া → ো, ে…ৗ → ৌ)
        if c in PRE_KARS and i + 1 < n and chars[i + 1] in CONSONANTS:
            seg = ''.join(chars[i + 1:])
            end = _cluster_end(seg, 0)
            cluster = seg[:end]
            rest_i = i + 1 + end
            # reph written after the cluster belongs before it: ে ক র্ → র্ ক ে (handled by the reph pass below)
            kar = c
            if c == 'ে' and rest_i < n and chars[rest_i] == 'া':
                kar = 'ো'; rest_i += 1
            elif c == 'ে' and rest_i < n and chars[rest_i] == 'ৗ':
                kar = 'ৌ'; rest_i += 1
            out.extend(cluster); out.append(kar)
            i = rest_i
            continue
        out.append(c)
        i += 1
    s = ''.join(out)

    # reph (র্) is typed after the consonant cluster (and its kars) it sits on: ক ি র্ → র্ ক ি
    chars = list(s)
    i = 0
    while i < len(chars) - 1:
        if chars[i] == 'র' and chars[i + 1] == HALANT and (i + 2 >= len(chars) or chars[i + 2] not in CONSONANTS or (i > 0 and chars[i - 1] != HALANT and _is_reph_position(chars, i))):
            if i > 0 and chars[i - 1] == HALANT:
                i += 1; continue  # র is part of a conjunct (…্র্…), not a reph
            j = i
            while j > 0 and chars[j - 1] in KARS | {'ঁ'}:
                j -= 1
            if j > 0 and chars[j - 1] in CONSONANTS:
                j -= 1
                while j >= 2 and chars[j - 1] == HALANT and chars[j - 2] in CONSONANTS:
                    j -= 2
                if j < i:
                    chars[j:i + 2] = ['র', HALANT] + chars[j:i]
            i += 2
            continue
        i += 1
    s = ''.join(chars)
    # chandrabindu belongs after the kar
    for k in POST_KARS:
        s = s.replace('ঁ' + k, k + 'ঁ')
    return s.replace('অা', 'আ').replace(HALANT + ZWNJ + HALANT + ZWNJ, HALANT + ZWNJ)


def _is_reph_position(chars, i):
    # র্ followed by a consonant is a reph typed at the end of the cluster it belongs to only when
    # the previous char closes a syllable (consonant or kar); otherwise it starts a new র-phala conjunct.
    return i > 0 and (chars[i - 1] in CONSONANTS or chars[i - 1] in KARS)


def bijoy_to_unicode(s):
    if not s:
        return s
    s = re.sub(r'(?<=\S) +(?=©)', '', s)  # a stray space typed before the reph glyph
    return _reorder(_map(s))


if __name__ == '__main__':
    import sys
    sys.stdout.reconfigure(encoding='utf-8')
    tests = {
        'Aóg kZ‡K evsjvi wmsnvm‡b e‡mb': 'অষ্টম শতকে বাংলার সিংহাসনে বসেন',
        '†mb ivRes‡ki PZz_© ivRv': 'সেন রাজবংশের চতুর্থ রাজা',
        'mßg kZ‡K evsjvi cÖfvekvjx ivRv wQ‡jb': 'সপ্তম শতকে বাংলার প্রভাবশালী রাজা ছিলেন',
        'ev‡iv fu~Bqv‡`i †bZv': 'বারো ভূঁইয়াদের নেতা',
        '1700 wLªóv‡ã evsjvi my‡e`vi': '১৭০০ খ্রিষ্টাব্দে বাংলার সুবেদার',
        'ivRv j²Y †mb| kv‡q¯Ív Lvb|': 'রাজা লক্ষ্মণ সেন। শায়েস্তা খান।',
        'DËi : ga¨hy‡M evsjvi A_©bxwZ wQj wkíwbf©i|': 'উত্তর : মধ্যযুগে বাংলার অর্থনীতি ছিল শিল্পনির্ভর।',
        'evwYR¨ KiZ| gjøhy× I Kzw¯Í': 'বাণিজ্য করত। মল্লযুদ্ধ ও কুস্তি',
        'mycwÊZ I Kwe| ÔAï×Õ wbY©q Ki': 'সুপণ্ডিত ও কবি। ‘অশুদ্ধ’ নির্ণয় কর',
        'k~b¨¯’vb c~iY Ki : cÖwZôvZv| ivRZ¡': 'শূন্যস্থান পূরণ কর : প্রতিষ্ঠাতা। রাজত্ব',
        'K…wlKvRB AÂj D‡VwQj HwZn¨evnx Øv`k': 'কৃষিকাজই অঞ্চল উঠেছিল ঐতিহ্যবাহী দ্বাদশ',
        'Rj`my¨‡`i KzwUiwkí enywbe©vPwb cÖkœ': 'জলদস্যুদের কুটিরশিল্প বহুনির্বাচনি প্রশ্ন',
        'eLwZqvi wLjRx Bwjqvm kvn& w`wjø‡Z KY©mye‡Y© ag©cvj': 'বখতিয়ার খিলজী ইলিয়াস শাহ্‌ দিল্লিতে কর্ণসুবর্ণে ধর্মপাল',
        '†Kv‡bv †gŠwjK ‡KŠkj': 'কোনো মৌলিক কৌশল',
        'Kg©KZ©v cwiPvjK': 'কর্মকর্তা পরিচালক',
    }
    bad = 0
    for src, want in tests.items():
        got = bijoy_to_unicode(src)
        ok = got == want
        bad += not ok
        print('OK ' if ok else 'BAD', got, '' if ok else f'  (want {want})')
    print('failures:', bad)
