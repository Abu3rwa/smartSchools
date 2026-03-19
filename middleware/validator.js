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
        body('password')
            .optional()
            .isLength({ min: 8 })
            .withMessage('Password must be at least 8 characters when provided'),
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
    ],

    // Attendance request type
    createAttendanceRequestType: [
        body('labelEn').notEmpty().trim().withMessage('English label is required')
    ],

    // Attendance request review
    reviewAttendanceRequest: [
        body('status').isIn(['approved', 'rejected']).withMessage('status must be approved or rejected'),
        body('reviewNote').optional().trim().isString()
    ],

    bulkEnrollStudents: [
        body('studentIds')
            .isArray({ min: 1 })
            .withMessage('studentIds must be a non-empty array'),
        body('studentIds.*')
            .isMongoId()
            .withMessage('Each studentId must be a valid ID'),
        body('classId')
            .isMongoId()
            .withMessage('classId must be a valid ID')
    ],

    createStudentLogin: [
        body('email')
            .optional()
            .isEmail()
            .withMessage('email must be valid when provided')
    ],

    transferStudent: [
        body('newClassId')
            .isMongoId()
            .withMessage('newClassId must be a valid class ID'),
        body('reason')
            .optional()
            .isString()
            .trim()
            .isLength({ max: 500 })
            .withMessage('reason must be at most 500 characters')
    ],

    promotionDecision: [
        body('decisionType')
            .isIn(['promote', 'retain', 'promote_with_conditions', 'hold_review'])
            .withMessage('decisionType must be one of promote, retain, promote_with_conditions, hold_review'),
        body('approvalStatus')
            .optional()
            .isIn(['pending', 'approved', 'rejected'])
            .withMessage('approvalStatus must be one of pending, approved, rejected'),
        body('reasonCode')
            .notEmpty()
            .trim()
            .withMessage('reasonCode is required'),
        body('targetClassId')
            .optional({ nullable: true, checkFalsy: true })
            .isMongoId()
            .withMessage('targetClassId must be a valid class ID when provided'),
        body('targetAcademicYear')
            .optional({ nullable: true })
            .isString()
            .trim()
            .isLength({ min: 3, max: 20 })
            .withMessage('targetAcademicYear must be a valid string when provided'),
        body('note')
            .optional({ nullable: true })
            .isString()
            .trim()
            .isLength({ max: 2000 })
            .withMessage('note must be at most 2000 characters'),
        body('conditions')
            .optional({ nullable: true })
            .isString()
            .trim()
            .isLength({ max: 2000 })
            .withMessage('conditions must be at most 2000 characters')
    ],

    updateReEnrollmentStatus: [
        body('reEnrollmentStatus')
            .optional()
            .isIn([
                'pending_contact',
                'documents_pending',
                'financial_clearance_pending',
                'approved_for_placement',
                'enrolled'
            ])
            .withMessage('Invalid reEnrollmentStatus'),
        body('seatFreezeUntil')
            .optional({ nullable: true })
            .isISO8601()
            .withMessage('seatFreezeUntil must be a valid ISO date when provided'),
        body('placementRecommendation.grade')
            .optional()
            .isInt({ min: 1, max: 12 })
            .withMessage('placementRecommendation.grade must be between 1 and 12'),
        body('placementRecommendation.section')
            .optional({ nullable: true })
            .isString()
            .trim()
            .isLength({ max: 10 })
            .withMessage('placementRecommendation.section must be a short string'),
        body('placementRecommendation.note')
            .optional({ nullable: true })
            .isString()
            .trim()
            .isLength({ max: 1000 })
            .withMessage('placementRecommendation.note must be at most 1000 characters'),
        body('note')
            .optional({ nullable: true })
            .isString()
            .trim()
            .isLength({ max: 1000 })
            .withMessage('note must be at most 1000 characters')
    ]
};
