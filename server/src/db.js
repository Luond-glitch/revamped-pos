const { Pool, types } = require('pg');
const config = require('./config');
types.setTypeParser(20, v => parseInt(v, 10)); // bigint (cents) -> number
const pool = new Pool({ connectionString: config.databaseUrl });
async function withTx(fn) { // all-or-nothing: a throw rolls everything back
  const c = await pool.connect();
  try { await c.query('BEGIN'); const r = await fn(c); await c.query('COMMIT'); return r; }
  catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
  finally { c.release(); }
}
module.exports = { pool, withTx, query: (t, p) => pool.query(t, p) };
