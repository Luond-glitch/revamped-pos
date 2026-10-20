const { Client } = require('pg'); const config = require('./config');
(async () => { // creates the database named in DATABASE_URL, so you do not need psql
  const u = new URL(config.databaseUrl), name = decodeURIComponent(u.pathname.slice(1));
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error('Use only lowercase letters, numbers and underscores in the database name.');
  u.pathname = '/postgres'; const c = new Client({ connectionString: u.toString() }); await c.connect();
  const ex = await c.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
  if (ex.rowCount) console.log(`Database "${name}" already exists.`); else { await c.query(`CREATE DATABASE ${name}`); console.log(`Created database "${name}".`); }
  await c.end();
})().catch(e => { console.error('Could not create the database:', e.message); process.exit(1); });
