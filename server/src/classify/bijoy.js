// Shared detector for Bengali text stored in the legacy Bijoy/SutonnyMJ ANSI encoding (renders as "wec`RbK").
// Two or more Bijoy glyph characters inside one word is the signal; ordinary English/Bengali text never has that.
export const BIJOY_SQL = "[†‡ˆ‰Š‹Œ¨©ª«¯°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞß÷`][^ ]*[†‡ˆ‰Š‹Œ¨©ª«¯°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞß÷`]";
export const BIJOY_TEXT = "CONCAT_WS(' ', q.body, q.option_a, q.option_b, q.option_c, q.option_d)";

if (process.argv[1]?.endsWith('bijoy.js')) {
  const { pool } = await import('../db.js');
  const [[r]] = await pool.query(`SELECT COUNT(*) n FROM questions q WHERE ${BIJOY_TEXT} REGEXP ?`, [BIJOY_SQL]);
  console.log(r);
  const [s] = await pool.query(`SELECT q.id, LEFT(CONCAT_WS(' | ', q.body, q.option_a, q.option_b), 110) t FROM questions q
    WHERE ${BIJOY_TEXT} REGEXP ? ORDER BY RAND() LIMIT 10`, [BIJOY_SQL]);
  console.table(s);
  await pool.end();
}
