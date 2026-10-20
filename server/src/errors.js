class AppError extends Error { constructor(status, message) { super(message); this.status = status; } }
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
function validate(schema, data) {
  const r = schema.safeParse(data);
  if (!r.success) { const i = r.error.issues[0]; throw new AppError(400, (i.path.length ? i.path.join('.') + ': ' : '') + i.message); }
  return r.data;
}
const isUuid = v => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v || '');
module.exports = { AppError, wrap, validate, isUuid };
