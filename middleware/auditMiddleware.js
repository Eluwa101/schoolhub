const { logAction } = require('../models/auditModel');

function auditLog(action, entityType) {
  return async (req, res, next) => {
    const originalJson = res.json.bind(res);
    const originalRedirect = res.redirect.bind(res);

    const doLog = async (entityId) => {
      if (req.user) {
        await logAction({
          schoolId: req.schoolId,
          userId: req.user.userId,
          action,
          entityType,
          entityId: entityId || req.params.id || null,
          metadata: {
            method: req.method,
            path: req.path,
            ip: req.ip,
          },
        }).catch(err => console.error('Audit error:', err.message));
      }
    };

    res.redirect = async (...args) => {
      await doLog();
      originalRedirect(...args);
    };

    next();
  };
}

module.exports = { auditLog };
