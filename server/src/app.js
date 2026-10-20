const path = require('path');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const PgStore = require('connect-pg-simple')(session);
const config = require('./config');
const { pool } = require('./db');
const { AppError } = require('./errors');
const { requireAuth, sameOrigin } = require('./middleware/auth');

const app = express();
app.disable('x-powered-by'); if (config.prod) app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  fontSrc: ['https://fonts.gstatic.com'], imgSrc: ["'self'", 'data:'], objectSrc: ["'none'"], frameAncestors: ["'none'"], upgradeInsecureRequests: null } } }));
app.use(express.json({ limit: '1mb' }));
app.use(session({ name: 'sid', secret: config.sessionSecret, resave: false, saveUninitialized: false, store: new PgStore({ pool, tableName: 'session' }),
  cookie: { httpOnly: true, sameSite: 'lax', secure: config.prod, maxAge: 12 * 60 * 60 * 1000 } }));

const api = express.Router();
api.use(sameOrigin);
api.get('/health', (req, res) => res.json({ ok: true }));
api.use('/auth', require('./modules/auth/routes'));
api.use('/products', requireAuth, require('./modules/products/routes'));
api.use('/inventory', requireAuth, require('./modules/inventory/routes'));
api.use('/sales', requireAuth, require('./modules/sales/routes'));
api.use('/registers', requireAuth, require('./modules/shifts/routes'));
api.use('/reports', requireAuth, require('./modules/reports/routes'));
api.use((req, res, next) => next(new AppError(404, 'Not found')));
app.use('/api/v1', api);
app.use(express.static(path.join(__dirname, '../../client'))); // serves the frontend from the same address, so no CORS is needed

app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ message: 'That upload is too large.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid request.' });
  if (err instanceof AppError) return res.status(err.status).json({ message: err.message });
  console.error(err); res.status(500).json({ message: 'Something went wrong. Please try again.' });
});
module.exports = app;
