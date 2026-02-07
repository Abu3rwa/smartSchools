import { validationResult, body, param, query } from 'express-validator';

// Validation result checker
export const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            errors: errors.array().map(err => ({
                field: err.path,
                message: err.msg
            }))
        });
    }
    next();
};

// Common validation rules
export const validationRules = {
    // Auth validations
    register: [
        body('email').isEmail().withMessage('Please provide a valid email'),
        body('password')
            .isLength({ min: 6 })
            .withMessage('Password must be at least 6 characters'),
        body('firstName').notEmpty().trim().withMessage('First name is required'),
        body('lastName').notEmpty().trim().withMessage('Last name is required'),
        body('role')
            .optional()
            .isIn(['admin', 'teacher', 'parent', 'student'])
            .withMessage('Invalid role')
    ],

    login: [
        body('email').isEmail().withMessage('Please provide a valid email'),
        body('password').notEmpty().withMessage('Password is required')
    ],

    // Student validations
    createStudent: [
        body('firstName').notEmpty().trim().withMessage('First name is required'),
        body('lastName').notEmpty().trim().withMessage('Last name is required'),
        // body('studentId').notEmpty().withMessage('Student ID is required'), // Auto-generated
        body('dateOfBirth').isISO8601().withMessage('Valid date of birth is required'),
        body('gender').isIn(['male', 'female', 'other']).withMessage('Invalid gender'),
        body('academicYear').notEmpty().withMessage('Academic year is required')
    ],

    // Teacher validations
    createTeacher: [
        body('firstName').notEmpty().trim().withMessage('First name is required'),
        body('lastName').notEmpty().trim().withMessage('Last name is required'),
        body('email').isEmail().withMessage('Valid email is required'),
        // body('employeeId').notEmpty().withMessage('Employee ID is required') // Auto-generated
    ],

    // Class validations
    createClass: [
        body('grade').isInt({ min: 1, max: 12 }).withMessage('Grade must be between 1 and 12'),
        body('academicYear').notEmpty().withMessage('Academic year is required')
    ],

    // Subject validations
    createSubject: [
        body('name').notEmpty().trim().withMessage('Subject name is required'),
        body('code').notEmpty().trim().withMessage('Subject code is required')
    ],

    // Grade validations
    createGrade: [
        body('student').isMongoId().withMessage('Valid student ID is required'),
        body('subject').isMongoId().withMessage('Valid subject ID is required'),
        body('class').isMongoId().withMessage('Valid class ID is required'),
        body('marks').isNumeric().withMessage('Marks must be a number'),
        body('maxMarks').isNumeric().withMessage('Maximum marks must be a number'),
        body('gradeType')
            .isIn(['daily', 'weekly', 'monthly_test', 'semester_exam'])
            .withMessage('Invalid grade type'),
        body('date').isISO8601().withMessage('Valid date is required')
    ],

    // Pagination
    pagination: [
        query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
        query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
    ],

    // MongoDB ObjectId
    mongoId: [
        param('id').isMongoId().withMessage('Invalid ID format')
    ]
};
