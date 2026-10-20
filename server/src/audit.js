// Record who did a sensitive thing. Pass the same client as the surrounding transaction so the log commits or rolls back with it.
module.exports = (c, req, action, entityType, entityId, details = null) =>
  c.query('INSERT INTO audit_logs (organisation_id, user_id, action, entity_type, entity_id, details) VALUES ($1,$2,$3,$4,$5,$6)',
    [req.user.orgId, req.user.id, action, entityType, entityId, details ? JSON.stringify(details) : null]);
