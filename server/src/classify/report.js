// Writes classification deliverables to docs/classification/*.csv
import fs from 'fs';
import { pool } from '../db.js';
const out = new URL('../../../docs/classification/', import.meta.url);
const csv = (name, rows) => {
  if (!rows.length) return fs.writeFileSync(new URL(name, out), '');
  const esc = (v) => (v == null ? '' : `"${String(v).replace(/"/g, '""').replace(/\s+/g, ' ')}"`);
  fs.writeFileSync(new URL(name, out), '﻿' + [Object.keys(rows[0]).join(','), ...rows.map((r) => Object.values(r).map(esc).join(','))].join('\n'));
  console.log(name, rows.length);
};
const [map] = await pool.query(`SELECT os.name_en old_subject, ot.name_bn old_topic, ns.name_en new_subject, nt.name_en new_topic, st.name_en new_subtopic, COUNT(*) questions
  FROM classification_audit a JOIN subjects os ON os.id=a.old_subject_id JOIN topics ot ON ot.id=a.old_topic_id
  JOIN subjects ns ON ns.id=a.new_subject_id JOIN topics nt ON nt.id=a.new_topic_id JOIN subtopics st ON st.id=a.new_subtopic_id
  WHERE a.cls_status='auto' GROUP BY 1,2,3,4,5 ORDER BY questions DESC`);
csv('mapping_old_to_new.csv', map);
const [rev] = await pool.query(`SELECT q.id question_id, s.name_en subject, a.cls_status, a.confidence, a.reason, LEFT(q.body,200) body
  FROM classification_audit a JOIN questions q ON q.id=a.question_id JOIN subjects s ON s.id=q.subject_id WHERE a.cls_status IN ('ambiguous','needs_review') ORDER BY a.cls_status, q.id`);
csv('manual_review.csv', rev);
const [bad] = await pool.query(`SELECT q.id question_id, s.name_en subject, CASE WHEN option_a='' OR option_b='' OR option_c='' OR option_d='' THEN 'blank option'
  WHEN CHAR_LENGTH(body)>700 THEN 'body too long (merged/creative?)' ELSE 'duplicate options' END issue, LEFT(body,200) body
  FROM questions q JOIN subjects s ON s.id=q.subject_id WHERE option_a='' OR option_b='' OR option_c='' OR option_d='' OR CHAR_LENGTH(body)>700
  OR option_a=option_b OR option_a=option_c OR option_a=option_d OR option_b=option_c OR option_b=option_d OR option_c=option_d ORDER BY q.id`);
csv('suspicious_or_incomplete.csv', bad);
const [keys] = await pool.query(`SELECT q.id question_id, s.name_en subject, q.correct_option marked, a.reason, LEFT(q.body,200) body
  FROM classification_audit a JOIN questions q ON q.id=a.question_id JOIN subjects s ON s.id=q.subject_id
  WHERE JSON_EXTRACT(a.details,'$.answer_key_suspect')=true ORDER BY q.id`);
csv('suspicious_answer_keys.csv', keys);
const [tax] =await pool.query(`SELECT s.name_en subject, t.name_en topic, t.name_bn topic_bn, st.name_en subtopic, st.name_bn subtopic_bn, COUNT(q.id) questions
  FROM topics t JOIN subjects s ON s.id=t.subject_id JOIN subtopics st ON st.topic_id=t.id LEFT JOIN questions q ON q.subtopic_id=st.id
  WHERE t.kind='concept' GROUP BY st.id ORDER BY s.id, t.name_en, st.name_en`);
csv('taxonomy.csv', tax);
const [[chk]] = await pool.query(`SELECT COUNT(*) total, SUM(source_topic_id IS NULL) no_backup, SUM(cls_status='auto') auto,
  (SELECT COUNT(*) FROM classification_audit WHERE cls_status='auto') audit_auto,
  (SELECT COUNT(*) FROM questions q JOIN topics t ON t.id=q.topic_id WHERE t.subject_id<>q.subject_id) topic_subject_mismatch FROM questions`);
console.log(chk);
const [st] = await pool.query('SELECT cls_status, COUNT(*) n FROM questions GROUP BY 1'); console.table(st);
await pool.end();
