import crypto from 'crypto';

/**
 * BE-030: Correlation ID middleware.
 * Attaches a unique request ID to every incoming request and sets it as
 * a response header so clients and log aggregators can trace end-to-end.
 */
const correlationId = (req, _res, next) => {
    req.correlationId = req.headers['x-request-id'] || crypto.randomUUID();
    _res.setHeader('x-request-id', req.correlationId);
    next();
};

export default correlationId;
