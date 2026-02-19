import StudentBehavior from '../models/StudentBehavior.js';
import Student from '../models/Student.js';
import Class from '../models/Class.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { inferAcademicYear } from '../utils/academicYear.js';
import { buildAcademicYearDateFilter, resolveAcademicYearForRequest } from '../helpers/academicYearScope.js';

const resolveBehaviorRange = (req, startDate, endDate, requestedAcademicYear = null) => {
    const effectiveAcademicYear = resolveAcademicYearForRequest(req, requestedAcademicYear);
    const hasExplicitRange = Boolean(startDate || endDate);
    if (hasExplicitRange) {
        return {
            effectiveAcademicYear,
            start: startDate ? new Date(startDate) : null,
            end: endDate ? new Date(endDate) : null
        };
    }

    const filter = buildAcademicYearDateFilter(effectiveAcademicYear, req.school);
    return {
        effectiveAcademicYear,
        start: filter?.$gte || null,
        end: filter?.$lte || null
    };
};

const applyBehaviorYearScope = (query, req, requestedAcademicYear = null) => {
    const effectiveAcademicYear = resolveAcademicYearForRequest(req, requestedAcademicYear);
    const yearDateFilter = buildAcademicYearDateFilter(effectiveAcademicYear, req.school);
    if (!yearDateFilter) {
        query.academicYear = effectiveAcademicYear;
        return effectiveAcademicYear;
    }

    query.$or = [
        { academicYear: effectiveAcademicYear },
        { academicYear: { $exists: false }, incidentDate: yearDateFilter },
        { academicYear: null, incidentDate: yearDateFilter }
    ];
    return effectiveAcademicYear;
};

/**
 * @desc    Create a new behavior incident
 * @route   POST /api/behavior
 * @access  Private (admin, behavior_manager, teacher with permission)
 */
export const createBehaviorIncident = asyncHandler(async (req, res) => {
    const {
        student,
        class: classId,
        incidentType,
        category,
        severity,
        title,
        description,
        incidentDate,
        location,
        locationDetails,
        witnesses,
        otherStudentsInvolved,
        actionTaken,
        actionDetails,
        followUpRequired,
        followUpDate,
        parentNotified,
        parentNotificationMethod,
        tags
    } = req.body;

    // Verify student exists and belongs to school
    const studentDoc = await Student.findOne({ _id: student, school: req.schoolId });
    if (!studentDoc) {
        return res.status(404).json({
            success: false,
            message: 'Student not found in your school'
        });
    }

    const resolvedIncidentDate = incidentDate ? new Date(incidentDate) : new Date();
    const resolvedClassId = classId || studentDoc.currentClass || undefined;
    let classAcademicYear = null;

    if (resolvedClassId) {
        const classDoc = await Class.findById(resolvedClassId).select('academicYear');
        classAcademicYear = classDoc?.academicYear || null;
    }

    const resolvedAcademicYear =
        classAcademicYear ||
        studentDoc.academicYear ||
        resolveAcademicYearForRequest(req) ||
        inferAcademicYear(resolvedIncidentDate, req.school?.settings?.academicYearStartMonth);

    const behaviorIncident = await StudentBehavior.create({
        student,
        school: req.schoolId,
        class: resolvedClassId,
        academicYear: resolvedAcademicYear,
        incidentType,
        category,
        severity,
        title,
        description,
        incidentDate: resolvedIncidentDate,
        location,
        locationDetails,
        reportedBy: req.user._id,
        witnesses: witnesses || [],
        otherStudentsInvolved: otherStudentsInvolved || [],
        actionTaken,
        actionDetails,
        followUpRequired: followUpRequired || false,
        followUpDate,
        parentNotified: parentNotified || false,
        parentNotificationMethod,
        tags: tags || []
    });

    const populated = await StudentBehavior.findById(behaviorIncident._id)
        .populate('student', 'firstName lastName studentId')
        .populate('reportedBy', 'firstName lastName title')
        .populate('class', 'name grade section');

    res.status(201).json({
        success: true,
        message: 'Behavior incident created successfully',
        data: { incident: populated, academicYear: resolvedAcademicYear }
    });
});

/**
 * @desc    Get all behavior incidents with filters
 * @route   GET /api/behavior
 * @access  Private (admin, behavior_manager, teacher with permission)
 */
export const getBehaviorIncidents = asyncHandler(async (req, res) => {
    const {
        student,
        class: classId,
        incidentType,
        category,
        severity,
        status,
        academicYear,
        startDate,
        endDate,
        page = 1,
        limit = 20
    } = req.query;

    const query = { school: req.schoolId };

    if (student) query.student = student;
    if (classId) query.class = classId;
    if (incidentType) query.incidentType = incidentType;
    if (category) query.category = category;
    if (severity) query.severity = severity;
    if (status) query.status = status;

    if (startDate || endDate) {
        query.incidentDate = {};
        if (startDate) query.incidentDate.$gte = new Date(startDate);
        if (endDate) query.incidentDate.$lte = new Date(endDate);
    } else {
        applyBehaviorYearScope(query, req, academicYear);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [incidents, total] = await Promise.all([
        StudentBehavior.find(query)
            .populate('student', 'firstName lastName studentId')
            .populate('reportedBy', 'firstName lastName title')
            .populate('class', 'name grade section')
            .populate('resolvedBy', 'firstName lastName')
            .sort({ incidentDate: -1 })
            .skip(skip)
            .limit(parseInt(limit)),
        StudentBehavior.countDocuments(query)
    ]);

    res.json({
        success: true,
        data: {
            incidents,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            },
            academicYear: resolveAcademicYearForRequest(req, academicYear)
        }
    });
});

/**
 * @desc    Get single behavior incident
 * @route   GET /api/behavior/:id
 * @access  Private
 */
export const getBehaviorIncident = asyncHandler(async (req, res) => {
    const effectiveAcademicYear = resolveAcademicYearForRequest(req);
    const yearDateFilter = buildAcademicYearDateFilter(effectiveAcademicYear, req.school);
    const incident = await StudentBehavior.findOne({
        _id: req.params.id,
        school: req.schoolId
    })
        .populate('student', 'firstName lastName studentId')
        .populate('reportedBy', 'firstName lastName title')
        .populate('class', 'name grade section')
        .populate('witnesses', 'firstName lastName title')
        .populate('otherStudentsInvolved', 'firstName lastName studentId')
        .populate('resolvedBy', 'firstName lastName')
        .populate('followUpCompletedBy', 'firstName lastName')
        .populate('notes.author', 'firstName lastName');

    if (!incident) {
        return res.status(404).json({
            success: false,
            message: 'Behavior incident not found'
        });
    }
    const isLegacyInYear = !incident.academicYear && yearDateFilter
        ? incident.incidentDate >= yearDateFilter.$gte && incident.incidentDate <= yearDateFilter.$lte
        : false;
    const isInYear = incident.academicYear === effectiveAcademicYear || isLegacyInYear;
    if (!isInYear) {
        return res.status(404).json({
            success: false,
            message: `Behavior incident not found for academic year ${effectiveAcademicYear}`
        });
    }

    res.json({
        success: true,
        data: { incident, academicYear: effectiveAcademicYear }
    });
});

/**
 * @desc    Update behavior incident
 * @route   PUT /api/behavior/:id
 * @access  Private (admin, behavior_manager, reporter)
 */
export const updateBehaviorIncident = asyncHandler(async (req, res) => {
    const scopedQuery = {
        _id: req.params.id,
        school: req.schoolId
    };
    applyBehaviorYearScope(scopedQuery, req);
    let incident = await StudentBehavior.findOne(scopedQuery);

    if (!incident) {
        return res.status(404).json({
            success: false,
            message: 'Behavior incident not found'
        });
    }

    // Check if user is admin, has permission, or is the reporter
    const isAdmin = req.user.role === 'admin';
    const isReporter = incident.reportedBy.toString() === req.user._id.toString();
    const hasPermission = req.user.permissions?.includes('manage_behavior');

    if (!isAdmin && !isReporter && !hasPermission) {
        return res.status(403).json({
            success: false,
            message: 'Not authorized to update this incident'
        });
    }

    // Update fields
    const allowedFields = [
        'incidentType', 'category', 'severity', 'title', 'description',
        'incidentDate', 'location', 'locationDetails', 'witnesses',
        'otherStudentsInvolved', 'actionTaken', 'actionDetails',
        'followUpRequired', 'followUpDate', 'followUpNotes',
        'parentNotified', 'parentNotificationMethod', 'parentResponse',
        'status', 'tags', 'academicYear'
    ];

    allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
            incident[field] = req.body[field];
        }
    });
    if (req.body.incidentDate !== undefined && req.body.academicYear === undefined) {
        incident.academicYear = inferAcademicYear(
            new Date(incident.incidentDate),
            req.school?.settings?.academicYearStartMonth
        );
    }

    await incident.save();

    const updated = await StudentBehavior.findById(incident._id)
        .populate('student', 'firstName lastName studentId')
        .populate('reportedBy', 'firstName lastName title')
        .populate('class', 'name grade section');

    res.json({
        success: true,
        message: 'Behavior incident updated successfully',
        data: { incident: updated }
    });
});

/**
 * @desc    Delete behavior incident
 * @route   DELETE /api/behavior/:id
 * @access  Private (admin only)
 */
export const deleteBehaviorIncident = asyncHandler(async (req, res) => {
    const scopedQuery = {
        _id: req.params.id,
        school: req.schoolId
    };
    applyBehaviorYearScope(scopedQuery, req);
    const incident = await StudentBehavior.findOne(scopedQuery);

    if (!incident) {
        return res.status(404).json({
            success: false,
            message: 'Behavior incident not found'
        });
    }

    await incident.deleteOne();

    res.json({
        success: true,
        message: 'Behavior incident deleted successfully'
    });
});

/**
 * @desc    Add note to behavior incident
 * @route   POST /api/behavior/:id/notes
 * @access  Private
 */
export const addNote = asyncHandler(async (req, res) => {
    const { content } = req.body;

    if (!content) {
        return res.status(400).json({
            success: false,
            message: 'Note content is required'
        });
    }

    const scopedQuery = {
        _id: req.params.id,
        school: req.schoolId
    };
    applyBehaviorYearScope(scopedQuery, req);
    const incident = await StudentBehavior.findOne(scopedQuery);

    if (!incident) {
        return res.status(404).json({
            success: false,
            message: 'Behavior incident not found'
        });
    }

    await incident.addNote(req.user._id, content);

    const updated = await StudentBehavior.findById(incident._id)
        .populate('notes.author', 'firstName lastName');

    res.json({
        success: true,
        message: 'Note added successfully',
        data: { incident: updated }
    });
});

/**
 * @desc    Mark incident as resolved
 * @route   PATCH /api/behavior/:id/resolve
 * @access  Private (admin, behavior_manager)
 */
export const resolveIncident = asyncHandler(async (req, res) => {
    const scopedQuery = {
        _id: req.params.id,
        school: req.schoolId
    };
    applyBehaviorYearScope(scopedQuery, req);
    const incident = await StudentBehavior.findOne(scopedQuery);

    if (!incident) {
        return res.status(404).json({
            success: false,
            message: 'Behavior incident not found'
        });
    }

    await incident.markResolved(req.user._id);

    const updated = await StudentBehavior.findById(incident._id)
        .populate('student', 'firstName lastName studentId')
        .populate('resolvedBy', 'firstName lastName');

    res.json({
        success: true,
        message: 'Incident marked as resolved',
        data: { incident: updated }
    });
});

/**
 * @desc    Get student behavior summary
 * @route   GET /api/behavior/student/:studentId/summary
 * @access  Private
 */
export const getStudentBehaviorSummary = asyncHandler(async (req, res) => {
    const { studentId } = req.params;
    const { startDate, endDate, academicYear } = req.query;

    // Verify student exists
    const student = await Student.findOne({ _id: studentId, school: req.schoolId });
    if (!student) {
        return res.status(404).json({
            success: false,
            message: 'Student not found'
        });
    }

    const { effectiveAcademicYear, start, end } = resolveBehaviorRange(
        req,
        startDate,
        endDate,
        academicYear
    );

    const summary = await StudentBehavior.getStudentBehaviorSummary(studentId, start, end);

    // Get recent incidents
    const query = { student: studentId, school: req.schoolId };
    if (start || end) {
        query.incidentDate = {};
        if (start) query.incidentDate.$gte = start;
        if (end) query.incidentDate.$lte = end;
    }

    const recentIncidents = await StudentBehavior.find(query)
        .populate('reportedBy', 'firstName lastName')
        .sort({ incidentDate: -1 })
        .limit(10);

    res.json({
        success: true,
        data: {
            student: {
                id: student._id,
                name: `${student.firstName} ${student.lastName}`,
                studentId: student.studentId
            },
            summary,
            recentIncidents,
            academicYear: effectiveAcademicYear
        }
    });
});

/**
 * @desc    Get class behavior stats
 * @route   GET /api/behavior/class/:classId/stats
 * @access  Private
 */
export const getClassBehaviorStats = asyncHandler(async (req, res) => {
    const { classId } = req.params;
    const { startDate, endDate, academicYear } = req.query;
    const { effectiveAcademicYear, start, end } = resolveBehaviorRange(
        req,
        startDate,
        endDate,
        academicYear
    );

    if (academicYear || (!startDate && !endDate)) {
        const classDoc = await Class.findById(classId).select('academicYear');
        if (!classDoc || classDoc.academicYear !== effectiveAcademicYear) {
            return res.status(404).json({
                success: false,
                message: `Class not found for academic year ${effectiveAcademicYear}`
            });
        }
    }

    const stats = await StudentBehavior.getClassBehaviorStats(classId, start, end);

    res.json({
        success: true,
        data: { stats, academicYear: effectiveAcademicYear }
    });
});

/**
 * @desc    Get pending follow-ups
 * @route   GET /api/behavior/follow-ups/pending
 * @access  Private (admin, behavior_manager)
 */
export const getPendingFollowUps = asyncHandler(async (req, res) => {
    const effectiveAcademicYear = resolveAcademicYearForRequest(req);
    const query = {
        school: req.schoolId,
        followUpRequired: true,
        followUpCompletedAt: null,
        followUpDate: { $lte: new Date() }
    };
    applyBehaviorYearScope(query, req, effectiveAcademicYear);

    const followUps = await StudentBehavior.find(query)
        .populate('student', 'firstName lastName studentId')
        .populate('reportedBy', 'firstName lastName')
        .sort({ followUpDate: 1 });

    res.json({
        success: true,
        data: { followUps, academicYear: effectiveAcademicYear }
    });
});

/**
 * @desc    Complete follow-up
 * @route   PATCH /api/behavior/:id/follow-up
 * @access  Private (admin, behavior_manager)
 */
export const completeFollowUp = asyncHandler(async (req, res) => {
    const { followUpNotes } = req.body;

    const scopedQuery = {
        _id: req.params.id,
        school: req.schoolId
    };
    applyBehaviorYearScope(scopedQuery, req);
    const incident = await StudentBehavior.findOne(scopedQuery);

    if (!incident) {
        return res.status(404).json({
            success: false,
            message: 'Behavior incident not found'
        });
    }

    incident.followUpNotes = followUpNotes;
    incident.followUpCompletedBy = req.user._id;
    incident.followUpCompletedAt = new Date();

    await incident.save();

    const updated = await StudentBehavior.findById(incident._id)
        .populate('followUpCompletedBy', 'firstName lastName');

    res.json({
        success: true,
        message: 'Follow-up completed',
        data: { incident: updated }
    });
});
