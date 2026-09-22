import crypto from 'crypto';
import MapTestRecord from '../models/MapTestRecord.js';
import MapPrepPlan from '../models/MapPrepPlan.js';
import MapPrepRound from '../models/MapPrepRound.js';
import MapPrepAnalysis from '../models/MapPrepAnalysis.js';
import MapPrepQuestionSet from '../models/MapPrepQuestionSet.js';
import MapPrepQuiz from '../models/MapPrepQuiz.js';
import MapPrepAttempt from '../models/MapPrepAttempt.js';
import Student from '../models/Student.js';
import Class from '../models/Class.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { resolveTeacherProfile, getTeacherClassIds } from '../helpers/teacherScoping.js';
import { resolveSchoolAcademicYear } from '../utils/academicYear.js';
import mapPrepAiService from '../services/mapPrepAiService.js';
import { parseMapCsv } from '../services/mapCsvExtractionService.js';

const getActiveYear = (req) => resolveSchoolAcademicYear(req.school || { settings: { currentAcademicYear: req.academicYear } });

const ensureTeacherClassAccess = async (req, classId) => {
    if (req.user.role === 'admin') return true;
    const teacher = await resolveTeacherProfile(req);
    if (!teacher) return false;
    const classIds = await getTeacherClassIds(teacher._id);
    return classIds.some((id) => String(id) === String(classId));
};

export const getMapClasses = asyncHandler(async (req, res) => {
    const academicYear = getActiveYear(req);
    const query = { school: req.schoolId, academicYear, isActive: true };
    if (req.user.role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        const classIds = teacher ? await getTeacherClassIds(teacher._id) : [];
        query._id = { $in: classIds };
    }
    const classes = await Class.find(query).select('name grade section academicYear subjects').sort({ grade: 1, section: 1 }).lean();
    res.json({ success: true, data: { academicYear, classes } });
});

export const getMapClassStudents = asyncHandler(async (req, res) => {
    const academicYear = getActiveYear(req);
    const classDoc = await Class.findOne({ _id: req.params.classId, school: req.schoolId, academicYear, isActive: true }).lean();
    if (!classDoc || !(await ensureTeacherClassAccess(req, classDoc._id))) {
        return res.status(403).json({ success: false, message: 'Not authorized for this class' });
    }
    const students = await Student.find({ school: req.schoolId, currentClass: classDoc._id, status: 'active', academicYear })
        .select('firstName lastName studentId currentClass')
        .sort({ firstName: 1, lastName: 1 }).lean();
    res.json({ success: true, data: { academicYear, class: classDoc, students } });
});

export const getStudentMapRecords = asyncHandler(async (req, res) => {
    const academicYear = getActiveYear(req);
    const student = await Student.findOne({ _id: req.params.studentId, school: req.schoolId, academicYear, status: 'active' }).lean();
    if (!student || !(await ensureTeacherClassAccess(req, student.currentClass))) {
        return res.status(403).json({ success: false, message: 'Not authorized for this student' });
    }
    const records = await MapTestRecord.find({ school: req.schoolId, student: student._id, academicYear })
        .populate('preparationPlan', 'title status currentRoundNumber analysisStatus')
        .sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: { academicYear, student, records } });
});

export const uploadMapRecord = asyncHandler(async (req, res) => {
    const academicYear = getActiveYear(req);
    const student = await Student.findOne({ _id: req.params.studentId, school: req.schoolId, academicYear, status: 'active' }).lean();
    if (!student || !(await ensureTeacherClassAccess(req, student.currentClass))) {
        return res.status(403).json({ success: false, message: 'Not authorized for this student' });
    }
    if (!req.file) return res.status(400).json({ success: false, message: 'A MAP CSV is required' });

    const fileHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    const extractedText = req.file.buffer.toString('utf8').slice(0, 100000);
    const extracted = parseMapCsv(extractedText);
    const testWindow = ['fall', 'winter', 'spring'].find((term) => extracted.term.toLowerCase().includes(term)) || 'other';
    const record = await MapTestRecord.create({
        school: req.schoolId,
        student: student._id,
        class: student.currentClass,
        subject: req.body.subjectId || null,
        academicYear,
        uploadedBy: req.user._id,
        sourceFileRef: null,
        sourceType: 'csv',
        sourceFileName: req.file.originalname,
        sourceFileHash: fileHash,
        extractedText,
        testDate: extracted.assessmentDate,
        testWindow,
        ritScore: extracted.ritScore,
        importedStudentId: extracted.studentId,
        importedStudentName: extracted.studentName,
        importedGrade: extracted.grade,
        importedSubject: extracted.subject,
        mapEvidence: extracted.evidence,
        domainScores: extracted.evidence.map((item) => ({ name: item.instructionalArea, instructionalArea: item.instructionalArea, domain: item.instructionalArea, skills: [item.standardDescription].filter(Boolean) })),
        goalAreas: [...new Map(extracted.evidence.map((item) => [item.instructionalArea, { name: item.instructionalArea }])).values()],
        extractionStatus: 'needs_review',
        extractionConfidence: 1
    });
    res.status(201).json({ success: true, data: { record } });
});

export const confirmMapRecord = asyncHandler(async (req, res) => {
    const record = await MapTestRecord.findOne({ _id: req.params.recordId, school: req.schoolId });
    if (!record || !(await ensureTeacherClassAccess(req, record.class))) return res.status(403).json({ success: false, message: 'Not authorized' });
    if (record.extractionStatus === 'confirmed' && record.preparationPlan) return res.json({ success: true, data: { record } });
    const updates = ['testDate', 'testWindow', 'ritScore', 'percentile', 'growthPercentile'];
    updates.forEach((field) => { if (req.body[field] !== undefined) record[field] = req.body[field] || null; });
    record.extractionStatus = 'confirmed';
    record.confirmedBy = req.user._id;
    record.confirmedAt = new Date();
    await record.save();
    const classDoc = await Class.findById(record.class).select('classTeacher subjects grade').lean();
    const teacher = req.user.role === 'teacher'
        ? await resolveTeacherProfile(req)
        : await (async () => {
            const subjectRow = (classDoc?.subjects || []).find((item) => String(item.subject) === String(record.subject));
            return subjectRow?.teacher || classDoc?.classTeacher || null;
        })();
    const plan = await MapPrepPlan.create({
        school: record.school,
        student: record.student,
        class: record.class,
        subject: record.subject,
        ownerTeacher: teacher?._id || teacher || record.uploadedBy,
        createdBy: req.user._id,
        academicYear: record.academicYear,
        mapTestRecord: record._id,
        title: `MAP Test Prep - ${record.testWindow || 'Test'} - ${record.academicYear}`,
        status: 'draft'
    });
    record.preparationPlan = plan._id;
    await record.save();
    res.json({ success: true, data: { record, plan } });
});

export const getMapRecord = asyncHandler(async (req, res) => {
    const record = await MapTestRecord.findOne({ _id: req.params.recordId, school: req.schoolId }).populate('student', 'firstName lastName studentId').populate('preparationPlan');
    if (!record || !(await ensureTeacherClassAccess(req, record.class))) return res.status(403).json({ success: false, message: 'Not authorized' });
    res.json({ success: true, data: { record } });
});

const getPlanForTeacher = async (req, planId) => {
    const plan = await MapPrepPlan.findOne({ _id: planId, school: req.schoolId })
        .populate('mapTestRecord')
        .populate('subject', 'name code')
        .populate('class', 'name grade');
    if (!plan || !(await ensureTeacherClassAccess(req, plan.class))) return null;
    return plan;
};

const buildSubjectContext = (plan) => ({
    subjectName: plan.subject?.name || 'the tested subject',
    gradeLevel: plan.class?.grade || null
});

const normalizeMapEvidence = (record) => {
    return (record.mapEvidence || []).map((item) => ({
        mapEvidenceId: item.mapEvidenceId,
        instructionalArea: item.instructionalArea,
        standardCode: item.standardCode || '',
        standardDescription: item.standardDescription || '',
        performanceLevel: item.performanceLevel || ''
    }));
};

const validateTopicGroups = (topicGroups, evidence) => {
    if (!Array.isArray(topicGroups)) throw new Error('MAP AI did not return topicGroups[]');
    if (topicGroups.length > 8) throw new Error('MAP AI returned more than 8 topic groups');
    const evidenceMap = new Map(evidence.map((item) => [item.mapEvidenceId, item]));
    const validStatuses = new Set(['priority', 'strength', 'mixed']);
    const validConfidence = new Set(['low', 'medium', 'high']);
    return topicGroups.map((group) => {
        if (!group?.name || !validStatuses.has(group.status) || !validConfidence.has(group.confidence) || !Array.isArray(group.sourceEvidenceIds) || !group.sourceEvidenceIds.length) {
            throw new Error('MAP AI returned an invalid topic group');
        }
        const sources = group.sourceEvidenceIds.map((mapEvidenceId) => {
            const sourceEvidence = evidenceMap.get(String(mapEvidenceId));
            if (!sourceEvidence) throw new Error('MAP AI returned a topic source evidence ID not present in the import');
            return { mapEvidenceId: sourceEvidence.mapEvidenceId, instructionalArea: sourceEvidence.instructionalArea, standardCode: sourceEvidence.standardCode, standardDescription: sourceEvidence.standardDescription, performanceLevel: sourceEvidence.performanceLevel };
        });
        const expectedStatus = sources.every((source) => source.performanceLevel === 'REINFORCE') ? 'strength' : sources.some((source) => source.performanceLevel === 'INTRODUCE') ? 'priority' : 'mixed';
        if (group.status !== expectedStatus) throw new Error('MAP AI returned a topic status inconsistent with its source evidence');
        return {
            name: String(group.name).trim(),
            description: String(group.description || '').trim(),
            status: group.status,
            sourceEvidenceIds: [...new Set(sources.map((source) => source.mapEvidenceId))],
            sourceEvidence: sources,
            skillCount: Math.max(0, Number(group.skillCount) || 0),
            scoreBandRange: String(group.scoreBandRange || ''),
            evidenceSummary: String(group.evidenceSummary || '').trim(),
            confidence: group.confidence
        };
    });
};

export const analyzeNextMapRound = asyncHandler(async (req, res) => {
    const plan = await getPlanForTeacher(req, req.params.planId);
    if (!plan || plan.mapTestRecord?.extractionStatus !== 'confirmed') {
        return res.status(404).json({ success: false, message: 'Confirmed MAP plan not found' });
    }
    const previousRound = await MapPrepRound.findOne({ school: req.schoolId, plan: plan._id }).sort({ roundNumber: -1 }).lean();
    const roundNumber = (previousRound?.roundNumber || 0) + 1;
    const sourceEvidence = normalizeMapEvidence(plan.mapTestRecord);
    const analysis = await mapPrepAiService.analyzeEvidence({
        ...buildSubjectContext(plan),
        evidence: sourceEvidence,
        testWindow: plan.mapTestRecord.testWindow,
        testDate: plan.mapTestRecord.testDate,
        ritScore: plan.mapTestRecord.ritScore,
        percentile: plan.mapTestRecord.percentile,
        previousRound,
        teacherFocusSkills: req.body?.focusSkills || [],
        targetStandards: req.body?.targetStandardIds || []
    });
    const topicGroups = validateTopicGroups(analysis.topicGroups, sourceEvidence);
    const limitations = [...new Set([
        ...(analysis.limitations || []),
        ...(sourceEvidence.length < 3 ? ['Evidence contains fewer than 3 MAP standards or skills, so the topic breakdown is limited.'] : [])
    ])];
    const previousAnalysis = await MapPrepAnalysis.findOne({ school: req.schoolId, plan: plan._id }).sort({ version: -1 }).lean();
    const round = await MapPrepRound.create({
        school: req.schoolId,
        plan: plan._id,
        previousRound: previousRound?._id || null,
        sourceMapTestRecord: plan.mapTestRecord._id,
        roundNumber,
        targetSkillIds: analysis.recommendedSkills || req.body?.focusSkills || [],
        targetStandardIds: req.body?.targetStandardIds || [],
        masteredSkillIds: analysis.masteredSkills || [],
        needsPracticeSkillIds: analysis.needsPracticeSkills || [],
        analysis,
        status: 'teacher_review',
        createdBy: req.user._id
    });
    const analysisSnapshot = await MapPrepAnalysis.create({
        school: req.schoolId,
        plan: plan._id,
        mapTestRecord: plan.mapTestRecord._id,
        round: round._id,
        version: (previousAnalysis?.version || 0) + 1,
        sourceEvidence,
        topicGroups,
        strengths: analysis.strengths || [],
        needsPracticeSkills: analysis.needsPracticeSkills || [],
        masteredSkills: analysis.masteredSkills || [],
        recommendedSkills: analysis.recommendedSkills || [],
        evidenceSummary: analysis.evidenceSummary || '',
        limitations,
        status: 'draft',
        createdBy: req.user._id
    });
    round.analysisSnapshot = analysisSnapshot._id;
    await round.save();
    plan.currentRoundNumber = roundNumber;
    plan.analysisStatus = 'teacher_review';
    await plan.save();
    res.status(201).json({ success: true, data: { round, analysis: analysisSnapshot } });
});

export const getMapAnalysis = asyncHandler(async (req, res) => {
    const plan = await getPlanForTeacher(req, req.params.planId);
    if (!plan) return res.status(404).json({ success: false, message: 'MAP plan not found' });
    const analysis = await MapPrepAnalysis.findOne({ _id: req.params.analysisId, school: req.schoolId, plan: plan._id }).populate('round').lean();
    if (!analysis) return res.status(404).json({ success: false, message: 'MAP analysis not found' });
    res.json({ success: true, data: { analysis } });
});

export const approveMapAnalysis = asyncHandler(async (req, res) => {
    const plan = await getPlanForTeacher(req, req.params.planId);
    const analysis = await MapPrepAnalysis.findOne({ _id: req.params.analysisId, school: req.schoolId, plan: plan?._id, status: 'draft' });
    if (!plan || !analysis) return res.status(404).json({ success: false, message: 'Draft MAP analysis not found' });
    analysis.status = 'approved';
    analysis.approvedBy = req.user._id;
    analysis.approvedAt = new Date();
    await analysis.save();
    if (analysis.round) await MapPrepRound.updateOne({ _id: analysis.round, school: req.schoolId, plan: plan._id }, { $set: { status: 'approved', approvedBy: req.user._id } });
    plan.analysisStatus = 'approved';
    await plan.save();
    res.json({ success: true, data: { analysis } });
});

const generateQuestionSetForRound = async (req, plan, round, { topicName, topicDescription } = {}) => {
    const questionCount = Math.min(Math.max(Number(req.body?.questionCount) || 10, 1), 50);
    let generated = null;
    try {
        generated = await mapPrepAiService.generateQuestionDrafts({
            ...buildSubjectContext(plan),
            mapTestRecord: plan.mapTestRecord,
            round: round.toObject(),
            topicName,
            topicDescription,
            questionCount,
            allowedQuestionTypes: req.body?.allowedQuestionTypes || ['true_false', 'multiple_choice', 'short_answer']
        });
    } catch (error) {
        generated = { questions: buildFallbackMapQuestions(round, questionCount) };
    }
    const generatedQuestions = Array.isArray(generated)
        ? generated
        : Array.isArray(generated?.questions)
            ? generated.questions
            : [];
    const validQuestions = generatedQuestions.filter(isUsableMapQuestion).slice(0, questionCount);
    const questions = validQuestions.length >= questionCount
        ? validQuestions
        : validQuestions.concat(buildFallbackMapQuestions(round, questionCount - validQuestions.length));
    const previousSet = await MapPrepQuestionSet.findOne({ school: req.schoolId, plan: plan._id }).sort({ version: -1 }).lean();
    return MapPrepQuestionSet.create({
        school: req.schoolId,
        plan: plan._id,
        round: round._id,
        version: (previousSet?.version || 0) + 1,
        status: 'teacher_review',
        generatedFromAnalysisId: round.analysisSnapshot || null,
        targetSkillIds: round.targetSkillIds,
        targetStandardIds: round.targetStandardIds,
        questions: questions.map((question, index) => ({ ...question, displayOrder: index + 1 }))
    });
};

export const generateMapQuestionDrafts = asyncHandler(async (req, res) => {
    const plan = await getPlanForTeacher(req, req.params.planId);
    if (!plan) return res.status(404).json({ success: false, message: 'MAP plan not found' });
    const round = await MapPrepRound.findOne({ _id: req.params.roundId, school: req.schoolId, plan: plan._id });
    if (!round) return res.status(404).json({ success: false, message: 'MAP round not found' });
    if (round.analysisSnapshot) {
        const analysis = await MapPrepAnalysis.findOne({ _id: round.analysisSnapshot, school: req.schoolId, plan: plan._id }).lean();
        if (analysis?.status !== 'approved') return res.status(409).json({ success: false, message: 'Teacher approval is required before generating questions' });
        const topicGroupIds = Array.isArray(req.body?.topicGroupIds) ? req.body.topicGroupIds.map(String) : [];
        if (topicGroupIds.length) {
            const selectedGroups = analysis.topicGroups.filter((group) => topicGroupIds.includes(String(group._id)));
            const selectedSources = new Set(selectedGroups.flatMap((group) => group.sourceEvidenceIds));
            const selectedSkills = analysis.sourceEvidence
                .filter((evidence) => selectedSources.has(evidence.mapEvidenceId))
                .map((evidence) => evidence.standardCode || evidence.standardDescription || evidence.instructionalArea);
            if (selectedSkills.length) {
                round.targetSkillIds = [...new Set(selectedSkills)];
                round.needsPracticeSkillIds = [...new Set(selectedSkills)];
                await round.save();
            }
        }
    }
    const questionSet = await generateQuestionSetForRound(req, plan, round);
    res.status(201).json({ success: true, data: { questionSet } });
});

export const getMapPlanTopics = asyncHandler(async (req, res) => {
    const plan = await getPlanForTeacher(req, req.params.planId);
    if (!plan) return res.status(404).json({ success: false, message: 'MAP plan not found' });
    res.json({ success: true, data: { topics: plan.topics, topicsStatus: plan.topicsStatus, topicsError: plan.topicsError } });
});

export const getMapPlanRounds = asyncHandler(async (req, res) => {
    const plan = await getPlanForTeacher(req, req.params.planId);
    if (!plan) return res.status(404).json({ success: false, message: 'MAP plan not found' });
    const rounds = await MapPrepRound.find({ school: req.schoolId, plan: plan._id }).sort({ roundNumber: -1 }).lean();
    res.json({ success: true, data: { rounds } });
});

export const generateMapTopicQuestions = asyncHandler(async (req, res) => {
    const plan = await getPlanForTeacher(req, req.params.planId);
    if (!plan) return res.status(404).json({ success: false, message: 'MAP plan not found' });
    const topic = plan.topics?.id(req.params.topicId);
    if (!topic) return res.status(404).json({ success: false, message: 'Topic not found' });
    const previousRound = await MapPrepRound.findOne({ school: req.schoolId, plan: plan._id }).sort({ roundNumber: -1 }).lean();
    const roundNumber = (previousRound?.roundNumber || 0) + 1;
    const skillIds = topic.skillCodes?.length ? topic.skillCodes : [topic.name];
    const round = await MapPrepRound.create({
        school: req.schoolId,
        plan: plan._id,
        previousRound: previousRound?._id || null,
        sourceMapTestRecord: plan.mapTestRecord._id,
        roundNumber,
        targetSkillIds: skillIds,
        needsPracticeSkillIds: skillIds,
        analysis: { topicId: topic._id, topicName: topic.name, description: topic.description, evidenceSummary: topic.evidenceSummary, source: 'topic_classification' },
        status: 'approved',
        createdBy: req.user._id
    });
    const questionSet = await generateQuestionSetForRound(req, plan, round, { topicName: topic.name, topicDescription: topic.description });
    plan.currentRoundNumber = roundNumber;
    topic.status = 'questions_generated';
    topic.lastQuestionSet = questionSet._id;
    await plan.save();
    res.status(201).json({ success: true, data: { questionSet, topic } });
});

export const deleteMapPrepRound = asyncHandler(async (req, res) => {
    const plan = await getPlanForTeacher(req, req.params.planId);
    if (!plan) return res.status(404).json({ success: false, message: 'MAP plan not found' });
    const round = await MapPrepRound.findOne({ _id: req.params.roundId, school: req.schoolId, plan: plan._id });
    if (!round) return res.status(404).json({ success: false, message: 'MAP round not found' });
    const publishedQuizExists = await MapPrepQuiz.exists({ school: req.schoolId, round: round._id, status: { $in: ['active', 'closed'] } });
    if (publishedQuizExists) {
        return res.status(409).json({ success: false, message: 'This round has a published quiz. Close or archive the quiz before deleting the round.' });
    }
    const questionSets = await MapPrepQuestionSet.find({ school: req.schoolId, round: round._id }).select('_id').lean();
    const questionSetIds = questionSets.map((item) => item._id);
    await MapPrepQuiz.deleteMany({ school: req.schoolId, round: round._id, status: 'draft' });
    await MapPrepQuestionSet.deleteMany({ school: req.schoolId, round: round._id });
    await MapPrepRound.deleteOne({ _id: round._id });
    let planChanged = false;
    plan.topics?.forEach((topic) => {
        if (topic.lastQuestionSet && questionSetIds.some((id) => String(id) === String(topic.lastQuestionSet))) {
            topic.status = 'available';
            topic.lastQuestionSet = null;
            planChanged = true;
        }
    });
    if (plan.currentRoundNumber === round.roundNumber) {
        const remainingTopRound = await MapPrepRound.findOne({ school: req.schoolId, plan: plan._id }).sort({ roundNumber: -1 }).lean();
        plan.currentRoundNumber = remainingTopRound?.roundNumber || 0;
        planChanged = true;
    }
    if (planChanged) await plan.save();
    res.json({ success: true, data: { deletedRoundId: round._id } });
});

export const deleteMapRecord = asyncHandler(async (req, res) => {
    const record = await MapTestRecord.findOne({ _id: req.params.recordId, school: req.schoolId });
    if (!record || !(await ensureTeacherClassAccess(req, record.class))) return res.status(404).json({ success: false, message: 'MAP import not found' });
    if (record.preparationPlan) {
        const plan = await MapPrepPlan.findOne({ _id: record.preparationPlan, school: req.schoolId }).lean();
        if (plan) {
            const rounds = await MapPrepRound.find({ school: req.schoolId, plan: plan._id }).select('_id').lean();
            const roundIds = rounds.map((round) => round._id);
            const quizzes = await MapPrepQuiz.find({ school: req.schoolId, plan: plan._id }).select('_id status').lean();
            if (quizzes.some((quiz) => ['active', 'closed'].includes(quiz.status))) {
                return res.status(409).json({ success: false, message: 'This MAP import has a published quiz. Close or archive it before deleting the import.' });
            }
            const quizIds = quizzes.map((quiz) => quiz._id);
            await MapPrepAttempt.deleteMany({ school: req.schoolId, quiz: { $in: quizIds } });
            await MapPrepQuiz.deleteMany({ school: req.schoolId, plan: plan._id });
            await MapPrepQuestionSet.deleteMany({ school: req.schoolId, plan: plan._id });
            await MapPrepAnalysis.deleteMany({ school: req.schoolId, plan: plan._id });
            await MapPrepRound.deleteMany({ school: req.schoolId, _id: { $in: roundIds } });
            await MapPrepPlan.deleteOne({ _id: plan._id, school: req.schoolId });
        }
    }
    await MapTestRecord.deleteOne({ _id: record._id, school: req.schoolId });
    res.json({ success: true, data: { deletedRecordId: record._id } });
});

const isUsableMapQuestion = (question) => {
    if (!question || typeof question.questionText !== 'string' || !question.questionText.trim()) return false;
    if (typeof question.explanation !== 'string' || !question.explanation.trim()) return false;
    if (question.questionType === 'short_answer') return true;
    if (typeof question.correctAnswer !== 'string' || !question.correctAnswer.trim()) return false;
    if (question.questionType === 'true_false') return true;
    if (question.questionType === 'multiple_choice') {
        return Array.isArray(question.options)
            && question.options.length >= 2
            && question.options.every((option) => option && typeof option.text === 'string' && option.text.trim());
    }
    return true;
};

const buildFallbackMapQuestions = (round, questionCount) => {
    const skills = round.needsPracticeSkillIds?.length
        ? round.needsPracticeSkillIds
        : (round.targetSkillIds?.length ? round.targetSkillIds : ['the selected MAP skill']);
    return Array.from({ length: questionCount }, (_, index) => {
        const skill = String(skills[index % skills.length]);
        const questionType = index % 3 === 0 ? 'true_false' : index % 3 === 1 ? 'multiple_choice' : 'short_answer';
        if (questionType === 'true_false') {
            return {
                questionText: `True or false: The student should review ${skill}.`,
                questionType,
                options: [{ label: 'A', text: 'True' }, { label: 'B', text: 'False' }],
                correctAnswer: 'True',
                explanation: `This practice item targets ${skill}.`,
                skillCode: skill,
                skillName: skill,
                domain: 'MAP preparation',
                difficulty: 'medium',
                displayOrder: index + 1
            };
        }
        if (questionType === 'multiple_choice') {
            return {
                questionText: `Which statement best describes ${skill}?`,
                questionType,
                options: [
                    { label: 'A', text: `It is a skill being practiced: ${skill}.` },
                    { label: 'B', text: 'It is unrelated to the preparation target.' },
                    { label: 'C', text: 'It is only a classroom behavior.' },
                    { label: 'D', text: 'It is only a test-taking rule.' }
                ],
                correctAnswer: 'A',
                explanation: `This practice item targets ${skill}.`,
                skillCode: skill,
                skillName: skill,
                domain: 'MAP preparation',
                difficulty: 'medium',
                displayOrder: index + 1
            };
        }
        return {
            questionText: `In your own words, explain what you know about ${skill}.`,
            questionType,
            options: [],
            correctAnswer: '',
            explanation: `Teacher review is required for this ${skill} response.`,
            skillCode: skill,
            skillName: skill,
            domain: 'MAP preparation',
            difficulty: 'medium',
            displayOrder: index + 1
        };
    });
};

export const publishMapQuiz = asyncHandler(async (req, res) => {
    const plan = await getPlanForTeacher(req, req.params.planId);
    const questionSet = await MapPrepQuestionSet.findOne({ _id: req.params.questionSetId, school: req.schoolId, plan: plan?._id, status: 'approved' });
    if (!plan || !questionSet) return res.status(404).json({ success: false, message: 'Approved MAP question set not found' });
    const round = await MapPrepRound.findOne({ _id: questionSet.round, school: req.schoolId, plan: plan._id });
    const questions = questionSet.questions.map((question) => question.toObject());
    const quiz = await MapPrepQuiz.create({
        school: req.schoolId,
        plan: plan._id,
        round: round._id,
        questionSet: questionSet._id,
        title: req.body?.title || `MAP Practice Round ${round.roundNumber}`,
        instructions: req.body?.instructions || '',
        questions,
        questionCount: questions.length,
        timeLimitSeconds: req.body?.timeLimitSeconds || null,
        status: 'active',
        publishedBy: req.user._id,
        publishedAt: new Date()
    });
    questionSet.status = 'published';
    questionSet.publishedAt = new Date();
    await questionSet.save();
    res.status(201).json({ success: true, data: { quiz } });
});

export const approveMapQuestionSet = asyncHandler(async (req, res) => {
    const plan = await getPlanForTeacher(req, req.params.planId);
    const questionSet = await MapPrepQuestionSet.findOne({ _id: req.params.questionSetId, school: req.schoolId, plan: plan?._id, status: 'teacher_review' });
    if (!plan || !questionSet) return res.status(404).json({ success: false, message: 'Question set awaiting review was not found' });
    questionSet.status = 'approved';
    questionSet.approvedBy = req.user._id;
    questionSet.approvedAt = new Date();
    await questionSet.save();
    res.json({ success: true, data: { questionSet } });
});

export const getMapQuestionSets = asyncHandler(async (req, res) => {
    const plan = await getPlanForTeacher(req, req.params.planId);
    if (!plan) return res.status(404).json({ success: false, message: 'MAP plan not found' });
    const questionSets = await MapPrepQuestionSet.find({ school: req.schoolId, plan: plan._id }).sort({ version: -1 }).lean();
    res.json({ success: true, data: { questionSets } });
});

export const updateMapQuestionSet = asyncHandler(async (req, res) => {
    const plan = await getPlanForTeacher(req, req.params.planId);
    const questionSet = await MapPrepQuestionSet.findOne({ _id: req.params.questionSetId, school: req.schoolId, plan: plan?._id, status: { $in: ['draft', 'teacher_review'] } });
    if (!plan || !questionSet) return res.status(404).json({ success: false, message: 'Editable question set not found' });
    if (!Array.isArray(req.body.questions) || req.body.questions.length === 0) return res.status(400).json({ success: false, message: 'questions[] is required' });
    questionSet.questions = req.body.questions.map((question, index) => ({ ...question, displayOrder: index + 1, teacherEdited: true }));
    questionSet.status = 'teacher_review';
    questionSet.approvedBy = null;
    questionSet.approvedAt = null;
    await questionSet.save();
    res.json({ success: true, data: { questionSet } });
});

const getStudentProfile = (req) => Student.findOne({ user: req.user._id, school: req.schoolId, status: 'active' }).lean();

export const getStudentMapQuizzes = asyncHandler(async (req, res) => {
    const student = await getStudentProfile(req);
    if (!student) return res.status(404).json({ success: false, message: 'Student profile not found' });
    const quizzes = await MapPrepQuiz.find({ school: req.schoolId, status: 'active' }).populate({ path: 'plan', match: { student: student._id }, select: 'title academicYear' }).lean();
    res.json({ success: true, data: { quizzes: quizzes.filter((quiz) => quiz.plan) } });
});

export const startStudentMapQuiz = asyncHandler(async (req, res) => {
    const student = await getStudentProfile(req);
    const quiz = await MapPrepQuiz.findOne({ _id: req.params.quizId, school: req.schoolId, status: 'active' }).populate('plan', 'student title');
    if (!student || !quiz || String(quiz.plan.student) !== String(student._id)) return res.status(404).json({ success: false, message: 'Quiz not found' });
    let attempt = await MapPrepAttempt.findOne({ school: req.schoolId, quiz: quiz._id, student: student._id });
    if (!attempt) attempt = await MapPrepAttempt.create({ school: req.schoolId, quiz: quiz._id, student: student._id, plan: quiz.plan._id, answers: [] });
    res.json({ success: true, data: { attempt, quiz: { ...quiz.toObject(), questions: quiz.questions.map(({ correctAnswer, ...question }) => question) } } });
});

export const submitStudentMapAnswer = asyncHandler(async (req, res) => {
    const student = await getStudentProfile(req);
    const attempt = await MapPrepAttempt.findOne({ _id: req.params.attemptId, school: req.schoolId, student: student?._id }).populate('quiz');
    if (!attempt || attempt.status !== 'in_progress') return res.status(404).json({ success: false, message: 'Active quiz attempt not found' });
    const question = attempt.quiz.questions.id(req.body.questionId);
    if (!question) return res.status(400).json({ success: false, message: 'Question not found' });
    const normalized = String(req.body.answer || '').trim().toLowerCase();
    const correct = question.questionType !== 'short_answer' && normalized === String(question.correctAnswer || '').trim().toLowerCase();
    const answer = { questionId: question._id, answer: req.body.answer, isCorrect: question.questionType === 'short_answer' ? null : correct, gradingStatus: question.questionType === 'short_answer' ? 'pending_teacher_review' : 'objective_graded', gradingSource: question.questionType === 'short_answer' ? null : 'deterministic' };
    attempt.answers = [...attempt.answers.filter((item) => String(item.questionId) !== String(question._id)), answer];
    await attempt.save();
    res.json({ success: true, data: { questionId: question._id, isCorrect: question.questionType === 'short_answer' ? null : correct, gradingStatus: answer.gradingStatus } });
});

export const submitStudentMapQuiz = asyncHandler(async (req, res) => {
    const student = await getStudentProfile(req);
    const attempt = await MapPrepAttempt.findOne({ _id: req.params.attemptId, school: req.schoolId, student: student?._id }).populate('quiz');
    if (!attempt) return res.status(404).json({ success: false, message: 'Quiz attempt not found' });
    attempt.status = 'submitted';
    attempt.submittedAt = new Date();
    await attempt.save();
    res.json({ success: true, data: { attemptId: attempt._id, questionCount: attempt.quiz.questionCount, answeredCount: attempt.answers.length, pendingReviewCount: attempt.answers.filter((answer) => answer.gradingStatus === 'pending_teacher_review').length } });
});

export const gradeMapQuizWithAi = asyncHandler(async (req, res) => {
    const quiz = await MapPrepQuiz.findOne({ _id: req.params.quizId, school: req.schoolId, status: 'closed' }).lean();
    if (!quiz || !(await ensureTeacherClassAccess(req, (await MapPrepPlan.findById(quiz.plan).select('class').lean())?.class))) return res.status(404).json({ success: false, message: 'Quiz not found' });
    const attempts = await MapPrepAttempt.find({ school: req.schoolId, quiz: quiz._id, status: 'submitted' }).lean();
    const pending = attempts.flatMap((attempt) => attempt.answers.filter((answer) => answer.gradingStatus === 'pending_teacher_review').map((answer) => ({ ...answer, student: attempt.student, attemptId: attempt._id })));
    const suggestions = await mapPrepAiService.suggestShortAnswerGrades({ quizId: quiz._id, pendingAnswers: pending });
    await Promise.all(attempts.map(async (attempt) => {
        const matching = (suggestions.suggestions || []).filter((suggestion) => String(suggestion.attemptId) === String(attempt._id));
        if (!matching.length) return;
        attempt.answers = attempt.answers.map((answer) => {
            const suggestion = matching.find((item) => String(item.questionId) === String(answer.questionId));
            return suggestion ? { ...answer, aiSuggestion: suggestion } : answer;
        });
        await MapPrepAttempt.updateOne({ _id: attempt._id }, { $set: { answers: attempt.answers } });
    }));
    res.json({ success: true, data: { suggestions: suggestions.suggestions || [] } });
});

const findTeacherAttempt = async (req, attemptId) => {
    const attempt = await MapPrepAttempt.findOne({ _id: attemptId, school: req.schoolId }).populate('quiz', 'plan status questions');
    if (!attempt) return null;
    const plan = await MapPrepPlan.findOne({ _id: attempt.plan, school: req.schoolId }).select('class title academicYear').lean();
    if (!plan || !(await ensureTeacherClassAccess(req, plan.class))) return null;
    return { attempt, plan };
};

export const closeMapQuiz = asyncHandler(async (req, res) => {
    const quiz = await MapPrepQuiz.findOne({ _id: req.params.quizId, school: req.schoolId });
    const plan = quiz ? await MapPrepPlan.findOne({ _id: quiz.plan, school: req.schoolId }).select('class').lean() : null;
    if (!quiz || !plan || !(await ensureTeacherClassAccess(req, plan.class))) return res.status(404).json({ success: false, message: 'Quiz not found' });
    quiz.status = 'closed';
    quiz.closedAt = new Date();
    await quiz.save();
    res.json({ success: true, data: { quiz } });
});

export const gradeMapShortAnswer = asyncHandler(async (req, res) => {
    const found = await findTeacherAttempt(req, req.params.attemptId);
    const { questionId, isCorrect, score, feedback } = req.body || {};
    if (!found || found.attempt.status !== 'submitted') return res.status(404).json({ success: false, message: 'Submitted attempt not found' });
    if (typeof isCorrect !== 'boolean' && !Number.isFinite(Number(score))) return res.status(400).json({ success: false, message: 'isCorrect or score is required' });
    const answer = found.attempt.answers.find((item) => String(item.questionId) === String(questionId));
    if (!answer) return res.status(404).json({ success: false, message: 'Answer not found' });
    answer.isCorrect = typeof isCorrect === 'boolean' ? isCorrect : Number(score) >= 0.5;
    answer.teacherGrade = { score: Number.isFinite(Number(score)) ? Number(score) : (answer.isCorrect ? 1 : 0), feedback: String(feedback || ''), gradedBy: req.user._id, gradedAt: new Date() };
    answer.gradingStatus = 'graded';
    answer.gradingSource = 'teacher';
    await found.attempt.save();
    res.json({ success: true, data: { attempt: found.attempt } });
});

export const overrideMapGrade = asyncHandler(async (req, res) => {
    const found = await findTeacherAttempt(req, req.params.attemptId);
    const answer = found?.attempt.answers.find((item) => String(item.questionId) === String(req.body?.questionId));
    if (!found || !answer || typeof req.body?.isCorrect !== 'boolean') return res.status(400).json({ success: false, message: 'Attempt, questionId, and boolean isCorrect are required' });
    answer.isCorrect = req.body.isCorrect;
    answer.teacherGrade = { ...(answer.teacherGrade || {}), score: req.body.isCorrect ? 1 : 0, feedback: String(req.body.feedback || ''), gradedBy: req.user._id, gradedAt: new Date() };
    answer.gradingStatus = 'graded';
    answer.gradingSource = 'teacher_override';
    await found.attempt.save();
    res.json({ success: true, data: { attempt: found.attempt } });
});

const buildMapReport = async (req, filter) => {
    const attempts = await MapPrepAttempt.find({ school: req.schoolId, ...filter }).populate('student', 'firstName lastName studentId').populate('quiz', 'title questionCount').lean();
    return attempts.map((attempt) => {
        const graded = attempt.answers.filter((answer) => answer.isCorrect !== null && answer.isCorrect !== undefined);
        const correct = graded.filter((answer) => answer.isCorrect).length;
        return { attemptId: attempt._id, student: attempt.student, quiz: attempt.quiz, status: attempt.status, questionCount: attempt.quiz?.questionCount || 0, answeredCount: attempt.answers.length, gradedCount: graded.length, pendingReviewCount: attempt.answers.filter((answer) => answer.gradingStatus === 'pending_teacher_review').length, correctCount: correct, percentage: graded.length ? Math.round((correct / graded.length) * 100) : null };
    });
};

export const getMapPlanReport = asyncHandler(async (req, res) => {
    const plan = await MapPrepPlan.findOne({ _id: req.params.planId, school: req.schoolId }).select('class title academicYear').lean();
    if (!plan || !(await ensureTeacherClassAccess(req, plan.class))) return res.status(404).json({ success: false, message: 'Plan not found' });
    const rows = await buildMapReport(req, { plan: plan._id });
    res.json({ success: true, data: { plan, rows } });
});

export const exportMapPlanReport = asyncHandler(async (req, res) => {
    const plan = await MapPrepPlan.findOne({ _id: req.params.planId, school: req.schoolId }).select('class title academicYear').lean();
    if (!plan || !(await ensureTeacherClassAccess(req, plan.class))) return res.status(404).json({ success: false, message: 'Plan not found' });
    const rows = await buildMapReport(req, { plan: plan._id });
    const csvEscape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = [
        ['Student', 'Quiz', 'Status', 'Assigned', 'Answered', 'Graded', 'Pending Review', 'Correct', 'Percentage'],
        ...rows.map((row) => [`${row.student?.firstName || ''} ${row.student?.lastName || ''}`.trim(), row.quiz?.title, row.status, row.questionCount, row.answeredCount, row.gradedCount, row.pendingReviewCount, row.correctCount, row.percentage ?? ''])
    ].map((line) => line.map(csvEscape).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="map-prep-${plan._id}.csv"`);
    res.send(csv);
});
