const router = require('express').Router();
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const config = require('../../config');
const { query } = require('../../db');
const { AppError, wrap, validate } = require('../../errors');
const { loadUser, publicUser, requireAuth } = require('../../middleware/auth');

const DUMMY = bcrypt.hashSync('not-a-real-password', 12); // so unknown emails take as long as wrong passwords
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: config.loginLimit, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many sign-in attempts. Try again in a few minutes.' } });
const call = (req, m, ...a) => new Promise((ok, no) => req.session[m](...a, e => (e ? no(e) : ok())));

router.post('/login', limiter, wrap(async (req, res) => {
  const { email, password } = validate(z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) }), req.body);
  const { rows } = await query('SELECT id, password_hash, status FROM users WHERE lower(email) = lower($1)', [email]);
  const u = rows[0], ok = await bcrypt.compare(password, u ? u.password_hash : DUMMY);
  if (!u || !ok) throw new AppError(401, 'Email or password is incorrect.');
  if (u.status !== 'active') throw new AppError(403, 'This account is switched off. Ask your manager.');
  await call(req, 'regenerate'); req.session.userId = u.id; await call(req, 'save'); // new session id on login
  res.json(publicUser(await loadUser(u.id)));
}));
router.post('/logout', (req, res) => req.session.destroy(() => { res.clearCookie('sid'); res.json({}); }));
router.get('/me', requireAuth, (req, res) => res.json(publicUser(req.user)));
module.exports = router;
