import { resolveAcademicYearDateRange } from '../utils/academicYear.js';

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MIN_SKILL_RESPONSES = 3;

const parseDate = (value) => {
  if (!DAY_PATTERN.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
};

export const resolveMapPracticeReportPeriod = ({ query = {}, academicYear, school }) => {
  const academicRange = resolveAcademicYearDateRange(academicYear, school);
  if (!academicRange) throw new Error('A valid academic year is required for this report.');

  const hasStartDate = query.startDate !== undefined && query.startDate !== '';
  const hasEndDate = query.endDate !== undefined && query.endDate !== '';
  if (hasStartDate !== hasEndDate) {
    const error = new Error('Both startDate and endDate are required when selecting a reporting period.');
    error.statusCode = 400;
    throw error;
  }

  if (!hasStartDate) {
    return {
      academicYear,
      startDate: academicRange.startDate,
      endDate: academicRange.endDate
    };
  }

  const startDate = parseDate(String(query.startDate));
  const parsedEndDate = parseDate(String(query.endDate));
  if (!startDate || !parsedEndDate) {
    const error = new Error('Dates must be valid calendar dates in YYYY-MM-DD format.');
    error.statusCode = 400;
    throw error;
  }

  const endDate = new Date(parsedEndDate);
  endDate.setUTCHours(23, 59, 59, 999);
  if (startDate > endDate || startDate < academicRange.startDate || endDate > academicRange.endDate) {
    const error = new Error('The reporting period must be ordered and within the current academic year.');
    error.statusCode = 400;
    throw error;
  }

  return { academicYear, startDate, endDate };
};

const getAnswerSkill = (answer) => {
  const populatedQuestion = answer.question && typeof answer.question === 'object' ? answer.question : null;
  const skill = populatedQuestion?.skill;
  if (!skill) return null;
  return {
    id: String(skill._id || skill.id || skill.code || skill.name),
    code: String(skill.code || ''),
    name: String(skill.name || skill.code || 'Unnamed skill'),
    skillSet: String(skill.strand || populatedQuestion.strand || '').trim()
  };
};

const addAnswerToSkill = (skillsById, answer) => {
  if (answer.isCorrect === null || answer.isCorrect === undefined) return;
  const skill = getAnswerSkill(answer);
  if (!skill) return;
  const current = skillsById.get(skill.id) || { ...skill, correct: 0, graded: 0 };
  current.graded += 1;
  if (answer.isCorrect === true) current.correct += 1;
  skillsById.set(skill.id, current);
};

const toSkillSummary = (skillsById) => [...skillsById.values()]
  .map((skill) => ({
    ...skill,
    accuracy: Math.round((skill.correct / skill.graded) * 100),
    evidence: skill.graded < MIN_SKILL_RESPONSES ? 'limited' : 'sufficient'
  }))
  .sort((first, second) => first.accuracy - second.accuracy || first.name.localeCompare(second.name));

const summarizeSkillSets = (skills) => {
  const skillSetsByName = new Map();
  skills.forEach((skill) => {
    const name = skill.skillSet || 'Unspecified skill set';
    const current = skillSetsByName.get(name) || {
      id: name,
      name,
      correct: 0,
      graded: 0
    };
    current.correct += skill.correct;
    current.graded += skill.graded;
    skillSetsByName.set(name, current);
  });
  return toSkillSummary(skillSetsByName);
};

const getSetTitle = (attempt, setById) => {
  const populatedSet = attempt.set && typeof attempt.set === 'object' ? attempt.set : null;
  return String(populatedSet?.title || setById.get(String(attempt.set?._id || attempt.set)) || 'Practice set');
};

const summarizeAttempts = ({ attempts = [], sets = [] }) => {
  const setById = new Map(sets.map((set) => [String(set._id), String(set.title || 'Practice set')]));
  const skillsById = new Map();
  let graded = 0;
  let correct = 0;
  let answered = 0;
  let pendingReviews = 0;

  const normalizedAttempts = attempts
    .filter((attempt) => attempt.submittedAt && ['submitted', 'reviewed'].includes(attempt.status))
    .sort((first, second) => new Date(first.submittedAt) - new Date(second.submittedAt))
    .map((attempt) => {
      const answers = Array.isArray(attempt.answers) ? attempt.answers : [];
      let attemptGraded = 0;
      let attemptCorrect = 0;
      answered += answers.length;
      answers.forEach((answer) => {
        if (answer.isCorrect === null || answer.isCorrect === undefined) {
          if (attempt.reviewStatus === 'pending') pendingReviews += 1;
          return;
        }
        attemptGraded += 1;
        graded += 1;
        if (answer.isCorrect === true) {
          attemptCorrect += 1;
          correct += 1;
        }
        addAnswerToSkill(skillsById, answer);
      });

      return {
        submittedAt: attempt.submittedAt,
        setTitle: getSetTitle(attempt, setById),
        reviewStatus: attempt.reviewStatus || 'pending',
        correct: attemptCorrect,
        graded: attemptGraded,
        accuracy: attemptGraded ? Math.round((attemptCorrect / attemptGraded) * 100) : null
      };
    });

  const skills = toSkillSummary(skillsById);
  return {
    attempts: normalizedAttempts,
    skills,
    metrics: {
      submittedSets: normalizedAttempts.length,
      answered,
      graded,
      correct,
      accuracy: graded ? Math.round((correct / graded) * 100) : null,
      pendingReviews,
      lastPractice: normalizedAttempts.length ? normalizedAttempts[normalizedAttempts.length - 1].submittedAt : null
    }
  };
};

export const buildMapPracticeStudentReport = ({
  student,
  academicYear,
  period,
  sets = [],
  attempts = [],
  generatedAt = new Date()
}) => {
  const summary = summarizeAttempts({ attempts, sets });
  const recentAttempts = [...summary.attempts].reverse().slice(0, 10);
  const interpretations = [];

  summary.skills.forEach((skill) => {
    if (skill.evidence === 'limited') {
      interpretations.push(`Only ${skill.graded} response${skill.graded === 1 ? ' is' : 's are'} graded for ${skill.name}; evidence is limited.`);
    } else if (skill.accuracy < 60) {
      interpretations.push(`Accuracy is below 60% for ${skill.name} (${skill.correct}/${skill.graded} graded responses).`);
    }
  });

  return {
    type: 'student',
    student: {
      name: `${student.firstName || ''} ${student.lastName || ''}`.trim(),
      studentId: student.studentId || '',
      className: student.currentClass?.name || '',
      grade: student.currentClass?.grade || student.currentGrade || null
    },
    academicYear,
    period,
    generatedAt,
    attempts: summary.attempts,
    recentAttempts,
    skills: summary.skills,
    skillSets: summarizeSkillSets(summary.skills),
    metrics: summary.metrics,
    interpretations: interpretations.slice(0, 6)
  };
};

export const buildMapPracticeClassReport = ({
  classRecord,
  students = [],
  sets = [],
  assignments = [],
  attempts = [],
  academicYear,
  period,
  generatedAt = new Date()
}) => {
  const studentIds = new Set(students.map((student) => String(student._id)));
  const classSets = sets.filter((set) => studentIds.has(String(set.student)));
  const classAssignments = assignments.filter((assignment) => studentIds.has(String(assignment.student)));
  const classAttempts = attempts.filter((attempt) => studentIds.has(String(attempt.student)));
  const attemptsByStudent = new Map();

  classAttempts.forEach((attempt) => {
    const key = String(attempt.student?._id || attempt.student);
    attemptsByStudent.set(key, [...(attemptsByStudent.get(key) || []), attempt]);
  });

  const assignmentsByStudent = new Set(classAssignments.map((assignment) => String(assignment.student)));
  const studentRows = students.map((student) => {
    const summary = summarizeAttempts({
      attempts: attemptsByStudent.get(String(student._id)) || [],
      sets: classSets
    });
    const hasLimitedEvidence = summary.metrics.graded < MIN_SKILL_RESPONSES;
    const needsSkillFollowUp = summary.skills.some((skill) => skill.evidence === 'sufficient' && skill.accuracy < 60);
    const status = !summary.metrics.submittedSets
      ? 'noRecentPractice'
      : hasLimitedEvidence
        ? 'limitedEvidence'
        : needsSkillFollowUp
          ? 'reviewSkills'
          : 'onTrack';
    return {
      name: `${student.firstName || ''} ${student.lastName || ''}`.trim(),
      studentId: student.studentId || '',
      submittedSets: summary.metrics.submittedSets,
      accuracy: summary.metrics.accuracy,
      graded: summary.metrics.graded,
      pendingReviews: summary.metrics.pendingReviews,
      lastPractice: summary.metrics.lastPractice,
      hasAssignment: assignmentsByStudent.has(String(student._id)),
      status,
      skills: summary.skills,
      attempts: summary.attempts
    };
  }).sort((first, second) => first.name.localeCompare(second.name));

  const skillMap = new Map();
  let pendingReviews = 0;
  let accuracyTotal = 0;
  let studentsWithAccuracy = 0;
  let submittedStudents = 0;
  let submittedSets = 0;

  studentRows.forEach((row) => {
    pendingReviews += row.pendingReviews;
    submittedSets += row.submittedSets;
    if (row.submittedSets) submittedStudents += 1;
    if (row.accuracy !== null) {
      accuracyTotal += row.accuracy;
      studentsWithAccuracy += 1;
    }
    row.skills.forEach((skill) => {
      const current = skillMap.get(skill.id) || {
        id: skill.id,
        code: skill.code,
        name: skill.name,
        skillSet: skill.skillSet,
        correct: 0,
        graded: 0
      };
      current.correct += skill.correct;
      current.graded += skill.graded;
      skillMap.set(skill.id, current);
    });
  });

  const skills = toSkillSummary(skillMap).filter((skill) => skill.graded >= MIN_SKILL_RESPONSES);
  const skillSets = summarizeSkillSets([...skillMap.values()]);
  const classStudentIds = new Set(students.map((student) => String(student._id)));
  const assignmentsCount = new Set(classAssignments.map((assignment) => String(assignment.student))).size;

  return {
    type: 'class',
    class: {
      name: classRecord.name,
      grade: classRecord.grade,
      section: classRecord.section || ''
    },
    academicYear,
    period,
    generatedAt,
    skills,
    skillSets,
    students: studentRows,
    metrics: {
      roster: classStudentIds.size,
      withAssignments: assignmentsCount,
      submittedStudents,
      submittedSets,
      averageAccuracy: studentsWithAccuracy ? Math.round(accuracyTotal / studentsWithAccuracy) : null,
      studentsWithAccuracy,
      pendingReviews
    }
  };
};
