const { query } = require('../db');
const { AppError } = require('../errors');

async function loadUser(id) { // read fresh on every request so switching a user off takes effect immediately
  const { rows } = await query(`
    SELECT x.*, (SELECT r.id FROM registers r WHERE r.branch_id = x."branchId" AND r.status = 'active' ORDER BY r.name LIMIT 1) AS "registerId" FROM (
    SELECT u.id, u.organisation_id AS "orgId", u.name, u.email, u.status,
      (SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id ORDER BY (r.name = 'manager') DESC, r.name LIMIT 1) AS role,
      COALESCE((SELECT array_agg(DISTINCT p.code) FROM user_roles ur JOIN role_permissions rp ON rp.role_id = ur.role_id JOIN permissions p ON p.id = rp.permission_id WHERE ur.user_id = u.id), '{}') AS permissions,
      COALESCE((SELECT ur.branch_id FROM user_roles ur WHERE ur.user_id = u.id AND ur.branch_id IS NOT NULL LIMIT 1),
               (SELECT b.id FROM branches b WHERE b.organisation_id = u.organisation_id ORDER BY b.name LIMIT 1)) AS "branchId"
    FROM users u WHERE u.id = $1) x`, [id]);
  return rows[0];
}
const publicUser = u => ({ id: u.id, name: u.name, email: u.email, role: u.role, permissions: u.permissions, branchId: u.branchId, registerId: u.registerId });

async function requireAuth(req, res, next) {
  try {
    if (!req.session.userId) throw new AppError(401, 'Not signed in');
    const u = await loadUser(req.session.userId);
    if (!u || u.status !== 'active') { req.session.destroy(() => {}); throw new AppError(401, 'Not signed in'); }
    req.user = u; next();
  } catch (e) { next(e); }
}
const requirePerm = code => (req, res, next) =>
  req.user.permissions.includes(code) ? next() : next(new AppError(403, 'You do not have permission to do that.'));

function sameOrigin(req, res, next) { // blocks forged cross-site writes on top of SameSite cookies
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const o = req.get('origin');
  try { if (o && new URL(o).host !== req.get('host')) return next(new AppError(403, 'Cross-site request blocked.')); } catch { return next(new AppError(403, 'Bad origin.')); }
  next();
}
module.exports = { loadUser, publicUser, requireAuth, requirePerm, sameOrigin };
