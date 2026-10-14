# Source path → (track, subject slug, class level, topic name). Subjects missing from the DB are created on
# first use from SUBJECTS below, so every file lands under a subject even when the app did not have one yet.
import os
import re

# slug: (track, name_bn, name_en)
SUBJECTS = {
    # academic (class 1-12)
    'aca-bangla': ('academic', 'বাংলা', 'Bangla'), 'aca-english': ('academic', 'ইংরেজি', 'English'),
    'aca-math': ('academic', 'গণিত', 'Mathematics'), 'aca-higher-math': ('academic', 'উচ্চতর গণিত', 'Higher Mathematics'),
    'aca-physics': ('academic', 'পদার্থবিজ্ঞান', 'Physics'), 'aca-chemistry': ('academic', 'রসায়ন', 'Chemistry'),
    'aca-biology': ('academic', 'জীববিজ্ঞান', 'Biology'), 'aca-science': ('academic', 'বিজ্ঞান', 'Science'),
    'aca-ict': ('academic', 'তথ্য ও যোগাযোগ প্রযুক্তি', 'ICT'),
    'aca-bgs': ('academic', 'বাংলাদেশ ও বিশ্বপরিচয়', 'Bangladesh & Global Studies'),
    'aca-agriculture': ('academic', 'কৃষিশিক্ষা', 'Agriculture'), 'aca-home-science': ('academic', 'গার্হস্থ্য বিজ্ঞান', 'Home Science'),
    'aca-islam': ('academic', 'ইসলাম ও নৈতিক শিক্ষা', 'Islam & Moral Education'),
    'aca-hindu': ('academic', 'হিন্দুধর্ম ও নৈতিক শিক্ষা', 'Hindu Religion & Moral Education'),
    'aca-christian': ('academic', 'খ্রিষ্টধর্ম ও নৈতিক শিক্ষা', 'Christian Religion'),
    'aca-buddhist': ('academic', 'বৌদ্ধধর্ম ও নৈতিক শিক্ষা', 'Buddhist Religion'),
    'aca-career': ('academic', 'ক্যারিয়ার শিক্ষা', 'Career Education'),
    'aca-physical-edu': ('academic', 'শারীরিক শিক্ষা ও স্বাস্থ্য', 'Physical Education & Health'),
    'aca-arts': ('academic', 'চারু ও কারুকলা', 'Arts & Crafts'), 'aca-work-life': ('academic', 'কর্ম ও জীবনমুখী শিক্ষা', 'Work & Life Oriented Education'),
    'aca-accounting': ('academic', 'হিসাববিজ্ঞান', 'Accounting'), 'aca-finance': ('academic', 'ফিন্যান্স ও ব্যাংকিং', 'Finance & Banking'),
    'aca-business': ('academic', 'ব্যবসায় উদ্যোগ / ব্যবস্থাপনা', 'Business Studies'),
    'aca-marketing': ('academic', 'উৎপাদন ব্যবস্থাপনা ও বিপণন', 'Production Management & Marketing'),
    'aca-civics': ('academic', 'পৌরনীতি ও নাগরিকতা', 'Civics'), 'aca-economics': ('academic', 'অর্থনীতি', 'Economics'),
    'aca-geography': ('academic', 'ভূগোল ও পরিবেশ', 'Geography'), 'aca-history': ('academic', 'ইতিহাস', 'History'),
    'aca-islamic-history': ('academic', 'ইসলামের ইতিহাস ও সংস্কৃতি', 'Islamic History & Culture'),
    'aca-sociology': ('academic', 'সমাজবিজ্ঞান', 'Sociology'), 'aca-social-work': ('academic', 'সমাজকর্ম', 'Social Work'),
    'aca-logic': ('academic', 'যুক্তিবিদ্যা', 'Logic'), 'aca-psychology': ('academic', 'মনোবিজ্ঞান', 'Psychology'),
    'aca-statistics': ('academic', 'পরিসংখ্যান', 'Statistics'), 'aca-arabic': ('academic', 'আরবি', 'Arabic'),
    'aca-general': ('academic', 'সাধারণ (একাডেমিক)', 'General (Academic)'),
    # admission
    'adm-bangla': ('admission', 'বাংলা (ভর্তি)', 'Bangla (Admission)'), 'adm-english': ('admission', 'ইংরেজি (ভর্তি)', 'English (Admission)'),
    'adm-math': ('admission', 'গণিত (ভর্তি)', 'Math (Admission)'), 'adm-physics': ('admission', 'পদার্থ (ভর্তি)', 'Physics (Admission)'),
    'adm-chemistry': ('admission', 'রসায়ন (ভর্তি)', 'Chemistry (Admission)'), 'adm-biology': ('admission', 'জীববিজ্ঞান (ভর্তি)', 'Biology (Admission)'),
    'adm-gk': ('admission', 'সাধারণ জ্ঞান (ভর্তি)', 'General Knowledge (Admission)'),
    'adm-general': ('admission', 'সাধারণ (ভর্তি)', 'General (Admission)'),
    # job
    'bangla': ('job', 'বাংলা ভাষা ও সাহিত্য', 'Bangla'), 'english': ('job', 'English Language & Literature', 'English'),
    'math': ('job', 'গাণিতিক যুক্তি', 'Mathematics'), 'mental-ability': ('job', 'মানসিক দক্ষতা', 'Mental Ability'),
    'bd-affairs': ('job', 'বাংলাদেশ বিষয়াবলি', 'Bangladesh Affairs'), 'intl-affairs': ('job', 'আন্তর্জাতিক বিষয়াবলি', 'International Affairs'),
    'geography': ('job', 'ভূগোল, পরিবেশ ও দুর্যোগ ব্যবস্থাপনা', 'Geography'), 'ethics': ('job', 'নৈতিকতা, মূল্যবোধ ও সুশাসন', 'Ethics'),
    'gen-science': ('job', 'সাধারণ বিজ্ঞান', 'General Science'), 'ict': ('job', 'কম্পিউটার ও তথ্যপ্রযুক্তি', 'ICT'),
    'job-gk': ('job', 'সাধারণ জ্ঞান', 'General Knowledge'), 'job-current-affairs': ('job', 'সাম্প্রতিক বিষয়াবলি', 'Current Affairs'),
    'job-accounting': ('job', 'হিসাববিজ্ঞান ও ব্যাংকিং', 'Accounting & Banking'), 'job-arabic': ('job', 'আরবি', 'Arabic'),
    'job-general': ('job', 'সাধারণ (চাকরি)', 'General (Job)'),
    'job-medical': ('job', 'চিকিৎসা বিজ্ঞান (পেশাগত)', 'Medical Science (Professional)'),
    'job-electrical': ('job', 'তড়িৎ প্রকৌশল (পেশাগত)', 'Electrical Engineering (Professional)'),
    'job-mechanical': ('job', 'যন্ত্রকৌশল (পেশাগত)', 'Mechanical Engineering (Professional)'),
}

# (pattern on the lowercased path, academic slug, job slug); first match wins, so specific names come first
RULES = [
    (r'higher\s*math|h\.\s*math|উচ্চতর\s*গণিত', 'aca-higher-math', 'math'),
    (r'mental|মানসিক', 'aca-general', 'mental-ability'),
    (r'current\s*affair|কারেন্ট|সাম্প্রতিক', 'aca-general', 'job-current-affairs'),
    (r'international|আন্তর্জাতিক|intl', 'aca-bgs', 'intl-affairs'),
    (r'bangladesh\s*affair|বাংলাদেশ\s*বিষয়|bd\s*affair', 'aca-bgs', 'bd-affairs'),
    (r'\bbgs\b|global\s*stud|বিশ্বপরিচয়|bangladesh\s*o\s*bishow|bangladesh\s*and\s*global', 'aca-bgs', 'bd-affairs'),
    (r'ethics|নৈতিকতা|সুশাসন', 'aca-general', 'ethics'),
    (r'physic|physice|পদার্থ', 'aca-physics', 'gen-science'),
    (r'chemi|রসায়ন', 'aca-chemistry', 'gen-science'),
    (r'biolog|জীববিজ্ঞান', 'aca-biology', 'gen-science'),
    (r'\bict\b|information\s*and\s*comm|computer|কম্পিউটার|তথ্য\s*(ও\s*যোগাযোগ\s*)?প্রযুক্তি|তথ্যপ্রযুক্তি', 'aca-ict', 'ict'),
    (r'agricult|aggricult|কৃষি', 'aca-agriculture', 'gen-science'),
    (r'hom[eo]\s*science|গার্হস্থ্য', 'aca-home-science', 'gen-science'),
    (r'islamic\s*history|ইসলামের\s*ইতিহাস', 'aca-islamic-history', 'job-gk'),
    (r'\bislam\b|ইসলাম', 'aca-islam', 'job-gk'),
    (r'hindu|হিন্দু', 'aca-hindu', 'job-gk'),
    (r'christ|খ্রিষ্ট', 'aca-christian', 'job-gk'),
    (r'buddh|বৌদ্ধ', 'aca-buddhist', 'job-gk'),
    (r'carie?r|ক্যারিয়ার', 'aca-career', 'job-general'),
    (r'physical|sariric|শারীরিক', 'aca-physical-edu', 'job-general'),
    (r'arts?\s*(and|&)\s*craft|চারু', 'aca-arts', 'job-general'),
    (r'work\s*(and|&)\s*life|কর্ম\s*ও\s*জীবন', 'aca-work-life', 'job-general'),
    (r'accounting|হিসাববিজ্ঞান', 'aca-accounting', 'job-accounting'),
    (r'finance|ফিন্যান্স|banking', 'aca-finance', 'job-accounting'),
    (r'production|marketing|বিপণন', 'aca-marketing', 'job-general'),
    (r'enterpren|entrepren|business|management|ব্যবসায়|ব্যবস্থাপনা', 'aca-business', 'job-general'),
    (r'civics|পৌরনীতি', 'aca-civics', 'bd-affairs'),
    (r'economics|অর্থনীতি', 'aca-economics', 'job-gk'),
    (r'geograph|ভূগোল', 'aca-geography', 'geography'),
    (r'histo?r|ইতিহাস', 'aca-history', 'bd-affairs'),
    (r'sociolog|সমাজবিজ্ঞান', 'aca-sociology', 'job-general'),
    (r'social\s*work|সমাজকর্ম', 'aca-social-work', 'job-general'),
    (r'logic|যুক্তিবিদ্যা', 'aca-logic', 'job-general'),
    (r'psycholog|মনোবিজ্ঞান', 'aca-psychology', 'job-general'),
    (r'statistic|পরিসংখ্যান', 'aca-statistics', 'math'),
    (r'arabic|আরবি', 'aca-arabic', 'job-arabic'),
    (r'general\s*science|সাধারণ\s*বিজ্ঞান|\bscience\b|বিজ্ঞান', 'aca-science', 'gen-science'),
    (r'math|গণিত|অংক|ম্যাথ', 'aca-math', 'math'),
    (r'english|grammar|vocab|narration|voice|tag\s*question|synonym|idiom|phrase|preposition|article|ইংরেজি', 'aca-english', 'english'),
    (r'bangla|বাংলা|bekoron|ব্যাকরণ|সাহিত্য|goddo|kobita|গদ্য|কবিতা', 'aca-bangla', 'bangla'),
    (r'\bg\s*k\b|general\s*knowledge|সাধারণ\s*জ্ঞান', 'aca-general', 'job-gk'),
]

ADM_SLUG = {'aca-bangla': 'adm-bangla', 'aca-english': 'adm-english', 'aca-math': 'adm-math', 'aca-higher-math': 'adm-math',
            'aca-physics': 'adm-physics', 'aca-chemistry': 'adm-chemistry', 'aca-biology': 'adm-biology'}

JOB_HINT = re.compile(r'job|bcs|bank|ntrca|primary\s*job|বিসিএস|ব্যাংক|প্রাইমারি|প্রাইমারী|প্রিলি|অধিদপ্তর|caab|নিয়োগ|'
                      r'current\s*affairs|job\s*solution|confidence|বিদ্যাবাড়ি|professor|প্রফেসর|অগ্রদূত|khairul|'
                      r'মোত্তাসিন|subjective|self\s*publication|pdf\s*corner|updated\s*pdf|crack|others\s*pdf|'
                      r'subject\s*&\s*book|ssc\s*ধরে|written', re.I)
ADM_HINT = re.compile(r'university\s*admission|admission\s*[a-d]\s*unit|unit[\s_-]*[a-d][\s_]*science|ভর্তি|বিশ্ববিদ্যালয়\s*ভর্তি', re.I)

CLASS_PATTERNS = [
    (r'class[\s_-]*(11|12)|11[\s_-]*12|hsc|college\s*level|একাদশ|দ্বাদশ', 'HSC'),
    (r'class[\s_-]*9[\s_-]*10|9[\s_-]*10|ssc|\bix\b|\bx\b|নবম|দশম|high\s*scool[^/\\]*[/\\][^/\\]*9', 'SSC'),
    (r'class[\s_-]*0?([1-8])\b|class[\s_-]*0?([1-8])[\s_-]', None),
    (r'\bviii\b', '8'), (r'\bvii\b', '7'), (r'\bvi\b', '6'),
]


def class_level(p):
    for rx, val in CLASS_PATTERNS:
        m = re.search(rx, p, re.I)
        if m:
            if val:
                return val
            return next(g for g in m.groups() if g)
    if re.search(r'primary\s*level', p, re.I):
        return 'primary'
    return None


GENERIC = re.compile(r'^(pdf|doc|docx|word|pdf file|word file|file|final|set|chapter|th|st|nd|rd|ques|ans|\d+)?$', re.I)
CONTAINERS = re.compile(r'^(pdf|doc|docx|word|pdf file|word file|file \d+|set-?\d+|final[\s-]*\d*)$', re.I)


def topic_name(rel):
    name = os.path.splitext(os.path.basename(rel))[0].replace('_', ' ')
    name = re.sub(r'^[\s\d০-৯]{1,3}[.)\-]\s*', '', name).strip(' -.')  # "01. Chapter" → "Chapter", keeps "10th"
    if GENERIC.match(name) or len(name) < 3:
        # name the file after its nearest meaningful folder: ".../MCQ NOTE/SET-2/DOC/3.doc" → "MCQ NOTE 3"
        for folder in reversed(os.path.dirname(rel).replace('\\', '/').split('/')):
            folder = folder.replace('_', ' ').strip()
            if folder and not CONTAINERS.match(folder):
                name = f'{folder} {name}'.strip()
                break
    return (re.sub(r'\s+', ' ', name) or 'বিবিধ')[:150]


def classify(rel):
    p = rel.replace('\\', '/').replace('_', ' ').lower()
    if not p.startswith('10.'):
        track = 'admission' if ADM_HINT.search(p) else 'job'
    elif 'job & admission' in p or JOB_HINT.search(p.split('/', 1)[-1] if 'job & admission' in p else ''):
        track = 'admission' if ADM_HINT.search(p) else 'job'
    else:
        track = 'academic'
    aca = job = None
    # match on the deepest folder names first, so "BCS Sheet/Physics" is Physics, not the book series
    parts = [x for x in re.split(r'[/]', p) if x]
    for part in reversed(parts):
        for rx, a, j in RULES:
            if re.search(rx, part, re.I):
                aca, job = a, j
                break
        if aca:
            break
    if track == 'academic':
        slug = aca or 'aca-general'
    elif track == 'admission':
        slug = ADM_SLUG.get(aca) or ('adm-gk' if job in ('job-gk', 'bd-affairs', 'intl-affairs', 'job-current-affairs') else 'adm-general')
    else:
        slug = job or 'job-general'
    return track, slug, class_level(p) if track == 'academic' else None, topic_name(rel)


if __name__ == '__main__':
    import sys
    sys.stdout.reconfigure(encoding='utf-8')
    import random
    paths = [os.path.relpath(os.path.join(d, f), sys.argv[1]) for d, _, fs in os.walk(sys.argv[1]) for f in fs
             if f.lower().endswith(('.pdf', '.doc', '.docx'))]
    random.seed(int(sys.argv[2]) if len(sys.argv) > 2 else 1)
    for rel in random.sample(paths, 60):
        print(classify(rel), '<-', rel[-75:])
