import { ZodError } from 'zod';

const toFieldPath = (path = []) => (
    Array.isArray(path) && path.length > 0 ? path.join('.') : 'request'
);

export const validateRequestSchema = ({
    bodySchema = null,
    querySchema = null,
    paramsSchema = null
} = {}) => (req, res, next) => {
    try {
        if (bodySchema) {
            req.body = bodySchema.parse(req.body ?? {});
        }
        if (querySchema) {
            req.query = querySchema.parse(req.query ?? {});
        }
        if (paramsSchema) {
            req.params = paramsSchema.parse(req.params ?? {});
        }
        return next();
    } catch (error) {
        if (error instanceof ZodError) {
            const validationError = new Error('Validation failed');
            validationError.statusCode = 400;
            validationError.code = 'VALIDATION_ERROR';
            validationError.details = error.issues.map((issue) => ({
                field: toFieldPath(issue.path),
                message: issue.message
            }));
            return next(validationError);
        }
        return next(error);
    }
};
