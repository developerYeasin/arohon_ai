# Unicode text of a source file → structured items. Every line ends up in exactly one item, so the
# union of the items is the whole text: 4-option MCQs, creative questions, and headed sections of anything else.
import re

BN_DIGITS = str.maketrans('০১২৩৪৫৬৭৮৯', '0123456789')
LETTERS_BN = 'কখগঘ'
LETTERS_EN = 'abcd'

# "১.", "০১।", "12)", "প্রশ্ন ৩." at the start of a line
Q_START = re.compile(r'^\s*(?:প্রশ্ন\s*[-:]?\s*)?([০-৯0-9]{1,4})\s*[.।):]\s*(?=\S|$)')
# option markers: (ক)  ক.  ক)  ক।  and a) (a) A.  — must be followed by text
OPT_BN = re.compile(r'\(\s*([কখগঘ])\s*\)\s*|(?:(?<=\s)|^)([কখগঘ])\s*[.)।:,]\s*|(?<=[ঀ-৿])([কখগঘ])[.)]\s*')
OPT_EN = re.compile(r'(?:(?<=\s)|^)(?:\(\s*([a-dA-D])\s*\)|([a-dA-D])[.)])\s+')
ANS_MARK = re.compile(r'\[উ:\s*([কখগঘ])\]')
ANS_TEXT = re.compile(r'(?:সঠিক\s*)?(?:উত্তর|উঃ|উ\.|উ:)\s*[:ঃ.\-–]?\s*\(?\s*([কখগঘ])\s*\)?(?![ঀ-৿])')
ANS_EN = re.compile(r'(?:\b(?:Ans(?:wer)?|Correct)|উত্তর|উঃ)\s*[:.\-–ঃ]?\s*\(?([a-dA-D])\)?(?![a-zA-Z])')
ANS_KEY_HEAD = re.compile(r'(উত্তরমালা|উত্তর\s*সংকেত|উত্তর\s*পত্র|উত্তর\s*তালিকা|Answer\s*(?:Key|Sheet)s?)', re.I)
ANS_KEY_PAIR = re.compile(r'(?<![০-৯0-9])([০-৯0-9]{1,4})\s*[.।:\-–)|]?\s*\(?([কখগঘa-dA-D])\)?(?![ঀ-৿a-zA-Z])')
CQ_ASK = re.compile(r'(ব্যাখ্যা|বিশ্লেষণ|মূল্যায়ন|যথার্থতা|নির্ণয়|লেখ|কর)\s*[।?]?\s*[১২৩৪]?\s*$')
MARK = '◉'
EXPLAIN = re.compile(r'^\s*◉?\s*(?:ব্যাখ্যা|নোট|সমাধান|টীকা|তথ্য|Solution|Explanation|Note|Explain)\s*[:ঃ\-–]\s*', re.I)
QA_RX = re.compile(r'(.+?\S)\s*(?:উত্তর|উঃ|Ans(?:wer)?|Answer)\s*[:ঃ\-–]\s*(.+)$', re.S)
INLINE_Q = re.compile(r'(?<=[।?!])\s+(?=[০-৯0-9]{1,3}\s*[.।]\s+\S)')
MARK_RX = re.compile(r'◉\s*')
MARKS_END = re.compile(r'([১২৩৪1234])\s*$')

HEADINGS = [
    ('note', re.compile(r'বহুনির্বাচনি|বহুনির্বাচনী|বহুপদী|অভিন্ন\s*তথ্য|MCQ|Multiple\s+Choice|Objective', re.I)),
    ('fill_blank', re.compile(r'শূন্যস্থান|শূণ্যস্থান|Fill\s+in', re.I)),
    ('true_false', re.compile(r'সত্য\s*/?\s*মিথ্যা|শুদ্ধ\s*/?\s*অশুদ্ধ|সঠিক\s*/?\s*ভুল|True\s*/?\s*False', re.I)),
    ('matching', re.compile(r'মিলকরণ|মিল\s*কর|বাম\s*অংশের|Match(?:ing)?\b', re.I)),
    ('creative', re.compile(r'সৃজনশীল|Creative\s+Question|\bCQ\b', re.I)),
    ('short_qa', re.compile(r'সংক্ষিপ্ত|জ্ঞানমূলক|অনুধাবনমূলক|Short\s+Question|এক\s*কথায়|প্রশ্ন\s*ও\s*উত্তর', re.I)),
    ('written', re.compile(r'রচনামূলক|বর্ণনামূলক|লিখিত|Written|Essay|রচনা|প্রবন্ধ|Paragraph|Composition|Letter|Application', re.I)),
]


def num(s):
    return int(s.translate(BN_DIGITS))


OPT_LINE = re.compile(r'^\s*(?:\(\s*[কখগঘa-dA-D]\s*\)|[কখগঘ]\s*[.)।:]|[a-dA-D][.)]\s)')


def heading_kind(line):
    # option rows ("ক. কারক খ. লিখিত …") and explanations mention words like 'লিখিত' — never headings
    if len(line) > 90 or OPT_LINE.match(line) or EXPLAIN.match(line) or ANS_MARK.search(line):
        return None
    for kind, rx in HEADINGS:
        if rx.search(line):
            return kind
    return None


def split_options(text):
    """Find ক খ গ ঘ (or a b c d) markers in order; returns (stem, [a,b,c,d], lang, marked answer) or None.
    A ◉ standing where a letter is expected is the book's mark on the correct option."""
    for rx, letters in ((OPT_BN, LETTERS_BN), (OPT_EN, LETTERS_EN)):
        tokens = [(m, next(g for g in m.groups() if g).lower()) for m in rx.finditer(text)]
        tokens += [(m, MARK) for m in MARK_RX.finditer(text)]
        tokens.sort(key=lambda t: t[0].start())
        marks, want, marked = [], 0, None
        for k, (m, letter) in enumerate(tokens):
            if want >= 4:
                break
            if letter == MARK:
                nxt = next((l for _, l in tokens[k + 1:] if l != MARK), None)
                if marked is None and (want > 0 or nxt == letters[1]) and (want == 3 or nxt == letters[want + 1]):
                    marks.append(m); marked = 'abcd'[want]; want += 1
            elif letter == letters[want]:
                marks.append(m)
                want += 1
            elif marks and letter == letters[0]:
                # restart: an earlier "ক." belonged to the stem
                marks, want, marked = [m], 1, None
        if want == 4:
            stem = text[:marks[0].start()].strip()
            opts = []
            for i, m in enumerate(marks):
                end = marks[i + 1].start() if i < 3 else len(text)
                opts.append(text[m.end():end].strip())
            if stem and all(opts):
                return stem, opts, letters, marked
    return None


def find_answer(text, letters):
    for rx in (ANS_MARK, ANS_TEXT, ANS_EN) if letters == LETTERS_BN else (ANS_EN, ANS_MARK, ANS_TEXT):
        m = rx.search(text)
        if m:
            ch = m.group(1).lower()
            return 'abcd'[(LETTERS_BN if ch in LETTERS_BN else LETTERS_EN).index(ch)], m
    return None, None


def strip_answer(s):
    s = ANS_MARK.sub('', s)
    s = re.sub(r'\s*(?:সঠিক\s*)?(?:উত্তর|উঃ|উ\.|উ:)\s*[:ঃ.\-–]?\s*\(?\s*[কখগঘ]\s*\)?\s*$', '', s)
    s = re.sub(r'\s*\[?\s*\b(?:Ans(?:wer)?|Correct)\s*[:.\-–]?\s*\(?[a-dA-D]\)?\s*\]?\s*$', '', s)
    return re.sub(r'[ \t]+', ' ', s).strip(' ]')


def _key_pairs(line):
    out = {}
    for n, ch in ANS_KEY_PAIR.findall(line):
        ch = ch.lower()
        out[num(n)] = 'abcd'[(LETTERS_BN if ch in LETTERS_BN else LETTERS_EN).index(ch)]
    return out


PURE_KEY = re.compile(r'^\s*(?:[০-৯0-9]{1,4}\s*[.।:\-–)|]?\s*\(?[কখগঘa-dA-D]\)?(?![ঀ-৿a-zA-Z])[\s,;|]*)+$')


def answer_keys(lines):
    """উত্তরমালা blocks as [(first line, end line, {question number: 'a'..'d'})]. A block is the heading
    plus the lines after it that are made of number–letter pairs (tables arrive as '১ | গ | ২ | খ'), or a
    heading-less run of lines that hold nothing but such pairs ('০১. গ' / '০২. খ' …, at least 4 of them)."""
    blocks = []
    i = 0
    while i < len(lines):
        if ANS_KEY_HEAD.search(lines[i]) and len(lines[i]) < 60:
            keys = _key_pairs(lines[i].split(ANS_KEY_HEAD.search(lines[i]).group(0), 1)[1])
            j = i + 1
            while j < len(lines) and j < i + 80:
                pairs = _key_pairs(lines[j])
                if pairs and len(pairs) * 6 >= len(lines[j].replace(' ', '').replace('|', '')) / 2:
                    keys.update(pairs)
                elif lines[j].strip(' |'):
                    break
                j += 1
            if keys:
                blocks.append((i, j, keys))
                i = j
                continue
        if PURE_KEY.match(lines[i]):
            keys, j, last = {}, i, i
            while j < len(lines) and (PURE_KEY.match(lines[j]) or not lines[j].strip(' |')):
                if lines[j].strip(' |'):
                    keys.update(_key_pairs(lines[j]))
                    last = j
                j += 1
            if len(keys) >= 4:
                blocks.append((i, last + 1, keys))
                i = last + 1
                continue
        if GRID_LINE.match(lines[i]):
            j, last = i, i
            while j < len(lines) and (GRID_LINE.match(lines[j]) or not lines[j].strip()):
                if lines[j].strip():
                    last = j
                j += 1
            keys = _grid_keys(lines[i:last + 1]) if last - i >= 5 else {}
            if len(keys) >= 4:
                blocks.append((i, last + 1, keys))
                i = last + 1
                continue
        i += 1
    return blocks


GRID_LINE = re.compile(r'^\s*(?:[০-৯0-9]+|[কখগঘ])(?:[ \t|]+(?:[০-৯0-9]+|[কখগঘ]))*\s*$')


def _grid_keys(lines):
    """An answer table that text extraction turned into columns: a run of numbers ('১' '২' … or '১১ ১২ …',
    with two-digit numbers sometimes split over lines: '২' '৩' = ২৩), then the run of their letters."""
    toks = [t for line in lines for t in re.split(r'[\s|]+', line.strip()) if t]
    runs = []  # [(is_letters, [tokens])]
    for t in toks:
        is_letter = t in LETTERS_BN
        if runs and runs[-1][0] == is_letter:
            runs[-1][1].append(t)
        else:
            runs.append((is_letter, [t]))
    keys, nxt = {}, 1
    for (dig, d), (let, ls) in zip(runs, runs[1:]):
        if dig or not let:
            continue
        digits = ''.join(d).translate(BN_DIGITS)
        k = len(ls)
        start = next((s for s in (nxt, int(digits[:1] or 0), int(digits[:2] or 0), int(digits[:3] or 0))
                      if s > 0 and ''.join(str(x) for x in range(s, s + k)) == digits), None)
        if start is None and len(d) == k:
            nums = [num(x) for x in d]
        elif start is not None:
            nums = list(range(start, start + k))
        else:
            continue
        for n_, l_ in zip(nums, ls):
            keys[n_] = 'abcd'[LETTERS_BN.index(l_)]
        nxt = nums[-1] + 1
    return keys


def key_for(key_blocks, line, n=None, qstarts=None):
    """The answer key that belongs to question n (starting at line): the first key after it — unless another
    question n comes between them, i.e. the key closes a later set — else the last key before it, if no
    question n lies between that key and this one."""
    between = lambda a, b: qstarts and n is not None and any(a < x < b for x in qstarts.get(n, ()))
    prev = None
    for s, e, keys in key_blocks:
        if s > line:
            return {} if between(line, s) else keys
        prev = (e, keys)
    if prev and not between(prev[0], line):
        return prev[1]
    return {}


def parse(text):
    """Returns a list of dicts: {type:'mcq'|'creative'|'section', ..., 'start': line index, 'end': line index}."""
    lines = text.split('\n')
    items = []
    # a new numbered question that starts after a sentence on the same line ("… উত্তর: ভেক্টর রাশি। ১. MKS …")
    lines = [part for line in lines for part in INLINE_Q.split(line)]
    # 1. cut the text into blocks at numbered lines and at headings
    blocks = []  # (start, end, number or None, heading kind or None)
    key_blocks = answer_keys(lines)
    in_key = set(i for s, e, _ in key_blocks for i in range(s, e))
    cur_start, cur_num = 0, None
    section_kind = None
    for i, line in enumerate(lines):
        if i in in_key:
            # answer-key lines are applied to their questions, not kept as text of their own
            if i > cur_start:
                blocks.append((cur_start, i, cur_num, section_kind))
            cur_start, cur_num = i + 1, None
            continue
        m = Q_START.match(line)
        hk = heading_kind(line) if not m else None
        if m or hk:
            if i > cur_start:
                blocks.append((cur_start, i, cur_num, section_kind))
            cur_start, cur_num = i, (num(m.group(1)) if m else None)
            if hk:
                section_kind = hk
    blocks.append((cur_start, len(lines), cur_num, section_kind))
    qstarts = {}
    for b_start, _, b_num, _ in blocks:
        if b_num is not None:
            qstarts.setdefault(b_num, []).append(b_start)

    context = None  # a shared stimulus ("নিচের উদ্দীপকটি পড়ে ৫ ও ৬ নং প্রশ্নের উত্তর দাও …") and the numbers it serves
    for start, end, n, sect in blocks:
        body = '\n'.join(lines[start:end]).strip()
        if not body:
            continue
        item, trailing = None, None
        if n is not None:
            # a bare "ক নৌকা" at the start of a line is an option marker too
            marked = re.sub(r'(?m)^([কখগঘ])[ \t]+(?=\S)', r'\1. ', body)
            # keep line breaks as ¶ so the last option can stop at the end of its line
            flat = re.sub(r'[ \t]+', ' ', Q_START.sub('', marked, count=1).replace('\n', ' ¶ '))
            got = split_options(flat)
            if got:
                stem, opts, letters, marked = got
                unflat = lambda s: re.sub(r'\s+', ' ', s.replace('¶', ' ')).strip()
                parts = [unflat(o) for o in opts]
                ends = [MARKS_END.search(o) for o in parts]
                asks = sum(bool(CQ_ASK.search(o)) for o in parts)
                if (all(ends) and [e.group(1).translate(BN_DIGITS) for e in ends] == ['1', '2', '3', '4']) \
                        or (len(stem) > 250 and asks >= 2):
                    item = {'type': 'creative', 'number': n, 'stimulus': unflat(stem), 'parts': parts}
                else:
                    last, _, rest = opts[3].partition('¶')
                    # an answer line right under the options still belongs to the question
                    am = re.match(r'\s*(\[উ:\s*[কখগঘ]\]|\[?\s*(?:সঠিক\s*)?(?:উত্তর|উঃ|উ\.|উ:|Ans(?:wer)?)\s*[:ঃ.\-–]?\s*\(?\s*[কখগঘa-dA-D]\s*\)?\s*\]?)\s*(¶|$|(?=(?:ব্যাখ্যা|নোট|সমাধান|Explanation|Solution|Note)\s*[:ঃ\-–]))', rest)
                    if am:
                        last, rest = last + ' ' + am.group(1), rest[am.end():]
                    opts = opts[:3] + [last]
                    trailing = unflat(rest) or None
                    q_text = unflat(stem + ' ' + ' '.join(opts))
                    ans = marked or find_answer(q_text, letters)[0]
                    if ans is None:
                        ans = key_for(key_blocks, start, n, qstarts).get(n)
                    qbody = strip_answer(unflat(stem))
                    if context and n in context[1]:
                        qbody = context[0] + '\n\n' + qbody
                    item = {'type': 'mcq', 'number': n, 'body': qbody,
                            'options': [strip_answer(unflat(o)) for o in opts], 'answer': ans}
                    if any(len(o) > 500 for o in item['options']) or len(item['body']) > 5000:
                        item, trailing = None, None  # a mis-split block; keep it as text
        if item is None and n is not None:
            # "১. সময়ের সাথে … কী বলে? উত্তর: দ্রুতি।" — a numbered question with its written answer
            qa = QA_RX.match(re.sub(r'\s+', ' ', Q_START.sub('', body, count=1)))
            if qa and len(qa.group(1)) < 600:
                item = {'type': 'qa', 'kind': sect if sect in ('fill_blank', 'true_false', 'written', 'creative') else 'short_qa',
                        'number': n, 'body': qa.group(1).strip(), 'answer': qa.group(2).strip()}
        if item is None:
            item = {'type': 'section', 'kind': sect or 'note', 'number': n, 'body': body}
        item['start'], item['end'] = start, end
        items.append(item)
        if trailing and item['type'] == 'mcq' and EXPLAIN.match(trailing):
            # the solution / note printed right under a question explains that question
            item['explanation'] = EXPLAIN.sub('', trailing, count=1).strip() or trailing
            trailing = None
        if trailing:
            items.append({'type': 'section', 'kind': 'note', 'number': None, 'body': trailing,
                          'start': start, 'end': end})
            served = stimulus_numbers(trailing, n)
            if served:
                context = (trailing, served)
        elif context and n is not None and n > max(context[1]):
            context = None
    return merge_sections(items)


STIM = re.compile(r'উদ্দীপক|অনুচ্ছেদ|কবিতাংশ|কাহিনি|ছক|চিত্র|তথ্য|passage|read\s+the', re.I)
RANGE = re.compile(r'([০-৯0-9]{1,4})\s*(?:ও|এবং|থেকে|হতে|-|–|—|to|and|,)\s*([০-৯0-9]{1,4})\s*(?:নং|নম্বর|নাম্বার)?')


def stimulus_numbers(text, current):
    """Question numbers a stimulus paragraph is for: '৫ ও ৬ নং প্রশ্নের উত্তর দাও' → {5, 6}."""
    if not STIM.search(text[:200]):
        return None
    m = RANGE.search(text[:200])
    if m:
        a, b = num(m.group(1)), num(m.group(2))
        if a <= b <= a + 10:
            return set(range(a, b + 1))
    return {current + 1, current + 2} if current is not None else None


def merge_sections(items):
    """Adjacent plain-text blocks of the same kind become one study item (keeps notes readable)."""
    out = []
    for it in items:
        if (it['type'] == 'section' and out and out[-1]['type'] == 'section' and out[-1]['kind'] == it['kind']
                and len(out[-1]['body']) + len(it['body']) < 6000):
            out[-1]['body'] += '\n' + it['body']
            out[-1]['end'] = it['end']
        else:
            out.append(it)
    return out


if __name__ == '__main__':
    import sys, json
    sys.stdout.reconfigure(encoding='utf-8')
    t = open(sys.argv[1], encoding='utf-8').read()
    for it in parse(t):
        print(json.dumps({k: v for k, v in it.items() if k not in ('start', 'end')}, ensure_ascii=False)[:400])
