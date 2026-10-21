import { asyncHandler } from '../middleware/errorHandler.js';
import MapPracticeAssignment from '../models/MapPracticeAssignment.js';
import MapPracticeAttempt from '../models/MapPracticeAttempt.js';
import MapPracticeQuestion from '../models/MapPracticeQuestion.js';
import Student from '../models/Student.js';
import { ensureTeacherCanAccessStudent } from '../services/mapPracticeAccessService.js';
import { buildMapPracticeProgressEmail } from '../services/mapPracticeProgressEmailService.js';
import { sendTransactionalEmail } from '../services/transactionalEmailService.js';
import logger from '../utils/logger.js';

export const sendMapPracticeProgressEmail = asyncHandler(async (req, res) => {
  if (!['admin', 'teacher'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Teacher access required.' });
  }

  const student = await Student.findOne({ _id: req.params.studentId, school: req.schoolId })
    .select('_id firstName lastName studentId email studentEmail parentInfo user')
    .populate('user', 'email');
  if (!student) {
    return res.status(404).json({ success: false, message: 'Student not found.' });
  }
  if (!(await ensureTeacherCanAccessStudent({ req, studentId: student._id }))) {
    return res.status(403).json({ success: false, message: 'Not authorized for this student.' });
  }

  const assignments = await MapPracticeAssignment.find({
    school: req.schoolId,
    student: student._id,
    status: { $in: ['assigned', 'active'] },
  })
    .populate('set', 'title questionCount')
    .sort({ createdAt: 1 })
    .lean();
  const assignedSetIds = assignments
    .map((assignment) => assignment.set?._id)
    .filter(Boolean);
  if (!assignedSetIds.length) {
    return res.status(400).json({
      success: false,
      message: 'There are no assigned MAP Prep skill sets to include in an email.',
    });
  }

  const [attempts, questions] = await Promise.all([
    MapPracticeAttempt.find({ school: req.schoolId, student: student._id, set: { $in: assignedSetIds } })
      .select('_id set status submittedAt reviewStatus score maxScore answers.question answers.questionId answers.response')
      .sort({ updatedAt: -1 })
      .lean(),
    MapPracticeQuestion.find({
      school: req.schoolId,
      student: student._id,
      set: { $in: assignedSetIds },
      active: true,
    })
      .populate('skill', 'name code')
      .select('set skill')
      .lean(),
  ]);
  const latestAttemptBySet = new Map();
  for (const attempt of attempts) {
    const setId = String(attempt.set);
    if (!latestAttemptBySet.has(setId)) latestAttemptBySet.set(setId, attempt);
  }

  const skillsBySet = new Map();
  for (const question of questions) {
    const setId = String(question.set);
    const skillName = question.skill?.name || question.skill?.code;
    if (skillName) skillsBySet.set(setId, [...(skillsBySet.get(setId) || []), skillName]);
  }

  const email = buildMapPracticeProgressEmail({
    student,
    assignments,
    attempts: [...latestAttemptBySet.values()],
    skillsBySet,
  });
  const recipients = student.getAllContactEmailEntries()
    .filter((recipient) => recipient.type === 'student' || ['father', 'mother', 'guardian'].includes(recipient.type));
  if (!recipients.length) {
    return res.status(400).json({
      success: false,
      message: 'No student or parent email addresses are listed for this student.',
    });
  }

  const results = [];
  for (const recipient of recipients) {
    try {
      await sendTransactionalEmail({
        to: recipient.email,
        subject: email.subject,
        text: email.text,
        html: email.html,
        schoolId: req.schoolId,
        preferredUserId: req.user._id,
      });
      results.push({ email: recipient.email, type: recipient.type, status: 'sent' });
    } catch (error) {
      logger.error('MAP Prep progress email delivery failed', {
        studentId: String(student._id),
        recipientType: recipient.type,
        error: error.message,
      });
      results.push({
        email: recipient.email,
        type: recipient.type,
        status: 'failed',
        message: 'Email delivery failed. Check the sender account and try again.',
      });
    }
  }

  const allSent = results.every((result) => result.status === 'sent');
  return res.status(allSent ? 200 : 207).json({
    success: allSent,
    data: {
      sent: results.filter((result) => result.status === 'sent').length,
      failed: results.filter((result) => result.status === 'failed').length,
      results,
      setsIncluded: email.rows.length,
    },
  });
});
