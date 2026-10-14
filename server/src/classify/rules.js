// Deterministic classification rules. A rule tests what the question asks (its stem + options),
// never the book or sheet it came from. Confidence < 85 is recorded for review but not applied.
const R = (family, topic, topicBn, sub, subBn, conf, re, opts = {}) => ({ family, topic, topicBn, sub, subBn, conf, re, ...opts });
const NUM = { needsNumber: true }; // maths rules only fire when the options are numeric

export const rules = [
  // ---- English ----
  R('english', 'Grammar', 'ব্যাকরণ', 'Voice', 'Voice', 95, /\b(passive|active) (voice|form)\b|\bvoice change\b|\binto passive\b|\bpassive\b.*\?/i),
  R('english', 'Grammar', 'ব্যাকরণ', 'Narration', 'Narration', 95, /\bnarration\b|\b(in)?direct speech\b/i),
  R('english', 'Grammar', 'ব্যাকরণ', 'Parts of Speech', 'Parts of Speech', 92, /\bparts? of speech\b/i),
  R('english', 'Grammar', 'ব্যাকরণ', 'Prepositions', 'Preposition', 90, /\bpreposition\b/i),
  R('english', 'Grammar', 'ব্যাকরণ', 'Tense', 'Tense', 88, /\btense\b/i),
  R('english', 'Grammar', 'ব্যাকরণ', 'Number', 'Number', 90, /\bplural (form|of)\b|\bsingular (form|of)\b/i),
  R('english', 'Grammar', 'ব্যাকরণ', 'Articles', 'Article', 86, /\b(appropriate|correct|suitable|definite|indefinite) article\b/i),
  R('english', 'Grammar', 'ব্যাকরণ', 'Clauses', 'Clause', 88, /\b(noun|adjective|adverb(ial)?|relative|subordinate|principal) clause\b/i),
  R('english', 'Grammar', 'ব্যাকরণ', 'Subject-Verb Agreement', 'Subject-Verb Agreement', 88, /subject[- ]verb agreement/i),
  R('english', 'Vocabulary', 'শব্দভান্ডার', 'Synonyms', 'Synonym', 95, /\bsynonym|\bclosest in meaning|\bnearest in meaning|\bsimilar (in )?meaning/i),
  R('english', 'Vocabulary', 'শব্দভান্ডার', 'Antonyms', 'Antonym', 95, /\bantonym|\bopposite (word|meaning)\b|\bopposite of\b/i),
  R('english', 'Vocabulary', 'শব্দভান্ডার', 'Spelling', 'Spelling', 92, /\bspelt\b|\bspelled\b|\bspelling\b|\bmisspel/i),
  R('english', 'Vocabulary', 'শব্দভান্ডার', 'One-Word Substitution', 'One Word Substitution', 92, /\bone[- ]word\b/i),
  R('english', 'Vocabulary', 'শব্দভান্ডার', 'Idioms and Phrases', 'Idioms & Phrases', 88, /\bidiom/i),
  R('english', 'Literature', 'ইংরেজি সাহিত্য', 'Authors and Works', 'লেখক ও গ্রন্থ', 86, /\b(who wrote|written by|author of|is the author|poet of|the play|the novel|the poem)\b/i, { needsLatin: true, catchAllOnly: true }),

  // ---- Bangla (Bengali-script stems only) ----
  R('bangla', 'ব্যাকরণ', 'ব্যাকরণ', 'Sandhi', 'সন্ধি', 95, /সন্ধি ?-?(বিচ্ছেদ|বিশ্লেষণ)|সন্ধির (নিয়ম|সংজ্ঞা|প্রকার|উদাহরণ)|কোন সন্ধি|সন্ধিজাত|(স্বর|ব্যঞ্জন|বিসর্গ|নিপাতনে) ?সন্ধি/),
  R('bangla', 'ব্যাকরণ', 'ব্যাকরণ', 'Samas', 'সমাস', 95, /সমাস/),
  R('bangla', 'ব্যাকরণ', 'ব্যাকরণ', 'Karak and Bibhakti', 'কারক ও বিভক্তি', 93, /(?<![ঀ-৿])কারক|বিভক্তি/),
  R('bangla', 'ব্যাকরণ', 'ব্যাকরণ', 'Prottoy', 'প্রত্যয়', 93, /প্রত্যয়/),
  R('bangla', 'ব্যাকরণ', 'ব্যাকরণ', 'Upasarga', 'উপসর্গ', 93, /উপসর্গ/),
  R('bangla', 'ব্যাকরণ', 'ব্যাকরণ', 'Correct Spelling', 'শুদ্ধ বানান', 93, /বানান/),
  R('bangla', 'ব্যাকরণ', 'ব্যাকরণ', 'Correct Sentence', 'শুদ্ধ বাক্য', 88, /শুদ্ধ বাক্য|অশুদ্ধ বাক্য|বাক্যটির শুদ্ধ/),
  R('bangla', 'ব্যাকরণ', 'ব্যাকরণ', 'Synonyms', 'সমার্থক শব্দ', 92, /সমার্থক|প্রতিশব্দ/),
  R('bangla', 'ব্যাকরণ', 'ব্যাকরণ', 'Antonyms', 'বিপরীত শব্দ', 92, /বিপরীত ?শব্দ|বিপরীতার্থ/),
  R('bangla', 'ব্যাকরণ', 'ব্যাকরণ', 'Idioms (Bagdhara)', 'বাগধারা', 95, /বাগ্?‌?ধারা/),
  R('bangla', 'ব্যাকরণ', 'ব্যাকরণ', 'One-Word Expression', 'এক কথায় প্রকাশ', 95, /এক ?কথায়/),
  R('bangla', 'ব্যাকরণ', 'ব্যাকরণ', 'Technical Terms', 'পারিভাষিক শব্দ', 93, /পারিভাষিক|পরিভাষা/),
  R('bangla', 'ব্যাকরণ', 'ব্যাকরণ', 'Phonetics and Letters', 'ধ্বনি ও বর্ণ', 86, /স্বরবর্ণ|ব্যঞ্জনবর্ণ|অল্পপ্রাণ|মহাপ্রাণ|ঘোষ ?বর্ণ|ধ্বনি পরিবর্তন|স্বরধ্বনি|ব্যঞ্জনধ্বনি/),
  R('bangla', 'ব্যাকরণ', 'ব্যাকরণ', 'Parts of Speech', 'পদ প্রকরণ', 86, /(কোন|কী|কি) পদ(?![ঀ-৿])|পদ প্রকরণ|বিশেষণ পদ|বিশেষ্য পদ|সর্বনাম পদ|অব্যয় পদ/, { noNumber: true }),
  R('bangla', 'ব্যাকরণ', 'ব্যাকরণ', 'Word Origin', 'শব্দের উৎস', 86, /তৎসম|তদ্ভব|দেশি শব্দ|বিদেশি শব্দ|ফারসি শব্দ|আরবি শব্দ|পর্তুগিজ শব্দ/),
  R('bangla', 'সাহিত্য', 'সাহিত্য', 'Works and Authors', 'গ্রন্থ ও রচয়িতা', 86, /রচয়িতা|কাব্যগ্রন্থ|উপন্যাস|নাটক|প্রবন্ধগ্রন্থ|ছোটগল্প|গল্পগ্রন্থ|আত্মজীবনী/, { catchAllOnly: true }),
  R('bangla', 'সাহিত্য', 'সাহিত্য', 'Poets and Writers', 'কবি ও সাহিত্যিক', 84, /ছদ্মনাম|চর্যাপদ|মঙ্গলকাব্য|পুঁথি/),

  // ---- Mathematics ----
  R('math', 'Arithmetic', 'পাটিগণিত', 'Profit and Loss', 'লাভ-ক্ষতি', 92, /শতকরা .*(লাভ|ক্ষতি)|(লাভ|ক্ষতি) হ|ক্রয়মূল্য|বিক্রয়মূল্য|\bprofit\b|cost price|selling price/i, NUM),
  R('math', 'Arithmetic', 'পাটিগণিত', 'Interest', 'সুদকষা', 93, /সরল সুদ|চক্রবৃদ্ধি|সুদে|simple interest|compound interest/i, NUM),
  R('math', 'Arithmetic', 'পাটিগণিত', 'Ratio and Proportion', 'অনুপাত ও সমানুপাত', 90, /অনুপাত|সমানুপাত|\bratio\b|\bproportion\b/i, NUM),
  R('math', 'Arithmetic', 'পাটিগণিত', 'Average', 'গড়', 90, /গড়|\baverage\b/i, NUM),
  R('math', 'Arithmetic', 'পাটিগণিত', 'Time and Work', 'সময় ও কাজ', 90, /দিনে .*কাজ|কাজটি .*দিনে|\bwork\b.*\bdays?\b/i, NUM),
  R('math', 'Arithmetic', 'পাটিগণিত', 'Time, Speed and Distance', 'সময়, দূরত্ব ও গতিবেগ', 88, /বেগে|গতিবেগ|স্রোতের|\bspeed\b|km\/h|কি\.মি\./i, NUM),
  R('math', 'Arithmetic', 'পাটিগণিত', 'LCM and HCF', 'ল.সা.গু ও গ.সা.গু', 95, /ল\.?\s?সা\.?\s?গু|গ\.?\s?সা\.?\s?গু|\b(L\.?C\.?M|H\.?C\.?F|G\.?C\.?D)\b/i, NUM),
  R('math', 'Algebra', 'বীজগণিত', 'Logarithm', 'লগারিদম', 93, /\blog\s?[0-9₀-₉a-z(]|লগারিদম/i, NUM),
  R('math', 'Algebra', 'বীজগণিত', 'Equations', 'সমীকরণ', 86, /সমীকরণ|\bequation\b/i, NUM),
  R('math', 'Algebra', 'বীজগণিত', 'Sequences and Series', 'অনুক্রম ও ধারা', 88, /সমান্তর ধারা|গুণোত্তর ধারা|\bseries\b|\bsequence\b/i, NUM),
  R('math', 'Trigonometry', 'ত্রিকোণমিতি', 'Trigonometric Ratios', 'ত্রিকোণমিতিক অনুপাত', 92, /\b(sin|cos|tan|cot|sec|cosec)\s?(θ|\(|[0-9০-৯]|[A-Zα-ω]\b|x\b|²)/, NUM),
  R('math', 'Geometry', 'জ্যামিতি', 'Triangles', 'ত্রিভুজ', 86, /ত্রিভুজ|\btriangle/i, NUM),
  R('math', 'Geometry', 'জ্যামিতি', 'Circles', 'বৃত্ত', 86, /বৃত্ত(?!ি)|\bcircle\b|ব্যাসার্ধ|\bradius\b/i, NUM),
  R('math', 'Geometry', 'জ্যামিতি', 'Polygons and Quadrilaterals', 'বহুভুজ ও চতুর্ভুজ', 86, /বহুভুজ|পঞ্চভুজ|ষড়ভুজ|চতুর্ভুজ|বর্গক্ষেত্র|আয়তক্ষেত্র|রম্বস|polygon|pentagon|hexagon|rectangle/i, NUM),
  R('math', 'Probability and Statistics', 'পরিসংখ্যান ও সম্ভাবনা', 'Probability', 'সম্ভাবনা', 93, /সম্ভাবনা|probability/i, NUM),

  // ---- ICT ----
  R('ict', 'Computer Basics', 'কম্পিউটার', 'Hardware', 'হার্ডওয়্যার', 88, /\b(RAM|ROM|CPU|ALU|hard ?disk|motherboard)\b|র‍?্যাম|সিপিইউ/),
  R('ict', 'Computer Basics', 'কম্পিউটার', 'Software and OS', 'সফটওয়্যার', 86, /\b(software|operating system|compiler|interpreter)\b|সফটওয়্যার|অপারেটিং সিস্টেম/i),
  R('ict', 'Networking and Internet', 'নেটওয়ার্ক ও ইন্টারনেট', 'Internet and Protocols', 'ইন্টারনেট', 88, /\b(internet|HTTP|TCP|IP address|URL|LAN|WAN|router|modem|wi-?fi|bluetooth)\b|ইন্টারনেট/),
  R('ict', 'Number Systems and Logic', 'সংখ্যা পদ্ধতি ও লজিক', 'Number Systems', 'সংখ্যা পদ্ধতি', 90, /\b(binary|octal|hexadecimal)\b|বাইনারি|হেক্সাডেসিমেল|অক্টাল/i),
  R('ict', 'Number Systems and Logic', 'সংখ্যা পদ্ধতি ও লজিক', 'Logic Gates', 'লজিক গেট', 92, /\blogic gate|\b(NAND|NOR|XOR)\b|লজিক গেট/i),
  R('ict', 'Programming and Databases', 'প্রোগ্রামিং ও ডেটাবেজ', 'Programming', 'প্রোগ্রামিং', 86, /\bprogramming language\b|\b(C\+\+|Python|HTML|SQL|DBMS)\b|প্রোগ্রামিং|ডেটাবেজ/i),
];

// Family → subject id per track. Job-track questions in movable subjects may move to the rule's subject;
// academic and admission questions keep their subject (a rule applies only when the families agree).
export const familySubject = {
  job: { bangla: 1, english: 2, math: 3, ict: 10 },
  admission: { bangla: 45, english: 15, math: 14 },
  academic: { bangla: 22, english: 27, math: 20, ict: 21 },
};
// Job subjects whose labels came from the source book; Mental Ability keeps its arithmetic (BCS syllabus).
export const movableJobSubjects = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 24, 43, 46]);
// Cross-subject moves allowed per family: language rules may pull from any job subject (vocabulary
// filed under Mental Ability etc.); maths/ICT rules only from catch-all book subjects, because a GK or
// science question can mention a ratio or software without testing maths or ICT.
export const CATCH_ALL = new Set([24, 43, 46]);
export const moveFrom = {
  bangla: movableJobSubjects, english: movableJobSubjects,
  math: CATCH_ALL, ict: new Set([...CATCH_ALL, 9]),
};
export const APPLY_MIN = 85;
