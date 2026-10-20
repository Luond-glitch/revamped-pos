require('dotenv').config();
const prod = process.env.NODE_ENV === 'production';
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is missing. Copy .env.example to .env and fill it in.'); process.exit(1); }
module.exports = {
  prod, port: Number(process.env.PORT) || 4000, databaseUrl: process.env.DATABASE_URL,
  loginLimit: Number(process.env.LOGIN_LIMIT) || (prod ? 10 : 100),
  get sessionSecret() {
    const s = process.env.SESSION_SECRET || '';
    if (s.length < 32) { console.error('SESSION_SECRET must be at least 32 characters. See .env.example.'); process.exit(1); }
    return s;
  },
};
