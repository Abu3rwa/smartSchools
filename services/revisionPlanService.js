import mongoose from 'mongoose';
import StudentLearningProfile from '../models/StudentLearningProfile.js';
import RevisionPlan from '../models/RevisionPlan.js';
import MasteryRecord from '../models/MasteryRecord.js';
import Standard from '../models/Standard.js';
import Student from '../models/Student.js';
import Subject from '../models/Subject.js';

/**
 * Compute or update StudentLearningProfile from MasteryRecord.
 * Strength = mastery >= 80%. Weak = mastery < 80% (includes 70–80% as "review recommended" so e.g. 75% gets a plan).
 */
export async function computeStudentLearningProfile(studentId, schoolId) {
  const student = await Student.findById(studentId);
  if (!student) {
    throw new Error('Student not found');
  }

  // Get all mastery records for this student
  const masteryRecords = await MasteryRecord.find({
    school: schoolId,
    student: studentId
  }).populate('standard');

  const strengths = [];
  const weaknesses = [];
  const subjectsSet = new Set();

  masteryRecords.forEach(record => {
    const masteryLevel = record.totalAttemptsAllTime > 0
      ? Math.round((record.totalCorrectAllTime / record.totalAttemptsAllTime) * 100)
      : 0;

    if (record.standard && record.standard.subject) {
      subjectsSet.add(record.standard.subject.toString());
    }

    if (masteryLevel >= 80 && record.isMastered) {
      strengths.push({
        standard: record.standard._id,
        masteryLevel
      });
    } else {
      // Weak for revision: < 80% or not mastered (includes 70–80% e.g. 75% accuracy)
      const severity = masteryLevel < 50 ? 3 : masteryLevel < 70 ? 2 : 1;
      weaknesses.push({
        standard: record.standard._id,
        masteryLevel,
        severity
      });
    }
  });

  // Upsert profile
  const profile = await StudentLearningProfile.findOneAndUpdate(
    { school: schoolId, student: studentId },
    {
      school: schoolId,
      student: studentId,
      gradeLevel: student.gradeLevel || null,
      subjects: Array.from(subjectsSet).map(id => new mongoose.Types.ObjectId(id)),
      strengths,
      weaknesses,
      lastComputedAt: new Date()
    },
    { upsert: true, new: true }
  );

  return profile;
}

/**
 * Generate a revision plan for a student.
 * Steps:
 * 1) Get weak areas (from profile or MasteryRecord)
 * 2) Priority = f(exam weight, weakness)
 * 3) Allocate time per topic
 * 4) Bin-pack into dailySchedule
 * 5) Add spaced repetition
 * 6) Save RevisionPlan
 */
export async function generatePlan(studentId, subjectId, examDate, options = {}, schoolId, createdByUserId) {
  const { examLabel, syllabusStandardIds } = options;

  // Validate exam date
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exam = new Date(examDate);
  exam.setHours(0, 0, 0, 0);

  if (exam <= today) {
    throw new Error('Exam date must be in the future');
  }

  const daysUntilExam = Math.ceil((exam - today) / (1000 * 60 * 60 * 24));

  // Get or compute learning profile
  let profile = await StudentLearningProfile.findOne({
    school: schoolId,
    student: studentId
  });

  if (!profile || !profile.lastComputedAt || 
      (new Date() - profile.lastComputedAt) > 7 * 24 * 60 * 60 * 1000) {
    profile = await computeStudentLearningProfile(studentId, schoolId);
  }

  // Get weak areas for this subject
  let weakStandards = profile.weaknesses || [];

  if (syllabusStandardIds && syllabusStandardIds.length > 0) {
    // Filter to only syllabus standards
    const syllabusIds = syllabusStandardIds.map(id => new mongoose.Types.ObjectId(id));
    weakStandards = weakStandards.filter(w => 
      syllabusIds.some(sid => sid.toString() === w.standard.toString())
    );
  } else {
    // Get all standards for this subject
    const subjectStandards = await Standard.find({
      school: schoolId,
      subject: subjectId
    }).select('_id');

    const subjectStandardIds = subjectStandards.map(s => s._id.toString());
    weakStandards = weakStandards.filter(w => 
      subjectStandardIds.includes(w.standard.toString())
    );
  }

  if (weakStandards.length === 0) {
    throw new Error('No weak areas found for this subject. Student may already be strong in this area.');
  }

  // Calculate priority and allocate time
  const topics = weakStandards.map(weak => {
    const examWeight = 0.5; // Default, can be enhanced later
    const weaknessLevel = 1 - (weak.masteryLevel / 100);
    const priorityScore = (examWeight * 0.4) + (weaknessLevel * 0.6);
    
    // Allocate time: more time for weaker topics
    const allocatedMinutes = Math.max(15, Math.min(60, 10 + (100 - weak.masteryLevel) * 0.3));

    return {
      standard: weak.standard,
      priority: Math.round(priorityScore * 100) / 100,
      masteryLevel: weak.masteryLevel,
      allocatedMinutes: Math.round(allocatedMinutes),
      completed: false
    };
  });

  // Sort by priority (highest first)
  topics.sort((a, b) => b.priority - a.priority);

  // Bin-pack into daily schedule
  const dailySchedule = [];
  const maxMinutesPerDay = 60;
  const reviewDays = [1, 3, 7]; // Spaced repetition intervals

  let currentDay = 0;
  const scheduledTopics = new Map(); // Track which topics are scheduled

  // Schedule new topics
  for (const topic of topics) {
    let remainingMinutes = topic.allocatedMinutes;

    while (remainingMinutes > 0 && currentDay < daysUntilExam - 1) {
      const scheduleDate = new Date(today);
      scheduleDate.setDate(scheduleDate.getDate() + currentDay);

      // Find or create day entry
      let dayEntry = dailySchedule.find(d => 
        d.date.toDateString() === scheduleDate.toDateString()
      );

      if (!dayEntry) {
        dayEntry = {
          date: scheduleDate,
          slots: []
        };
        dailySchedule.push(dayEntry);
      }

      // Calculate available minutes for this day
      const usedMinutes = dayEntry.slots.reduce((sum, slot) => sum + slot.minutes, 0);
      const availableMinutes = maxMinutesPerDay - usedMinutes;

      if (availableMinutes > 0) {
        const minutesToSchedule = Math.min(remainingMinutes, availableMinutes);
        dayEntry.slots.push({
          standard: topic.standard,
          minutes: minutesToSchedule,
          completed: false
        });
        remainingMinutes -= minutesToSchedule;

        // Track that this topic is scheduled
        if (!scheduledTopics.has(topic.standard.toString())) {
          scheduledTopics.set(topic.standard.toString(), []);
        }
        scheduledTopics.get(topic.standard.toString()).push(currentDay);
      }

      currentDay++;
      if (currentDay >= daysUntilExam - 1) break;
    }
  }

  // Add spaced repetition reviews
  scheduledTopics.forEach((days, standardId) => {
    days.forEach(originalDay => {
      reviewDays.forEach(interval => {
        const reviewDay = originalDay + interval;
        if (reviewDay < daysUntilExam - 1) {
          const reviewDate = new Date(today);
          reviewDate.setDate(reviewDate.getDate() + reviewDay);

          let dayEntry = dailySchedule.find(d => 
            d.date.toDateString() === reviewDate.toDateString()
          );

          if (!dayEntry) {
            dayEntry = {
              date: reviewDate,
              slots: []
            };
            dailySchedule.push(dayEntry);
          }

          // Check if review already exists
          const hasReview = dayEntry.slots.some(slot => 
            slot.standard.toString() === standardId.toString()
          );

          if (!hasReview) {
            const usedMinutes = dayEntry.slots.reduce((sum, slot) => sum + slot.minutes, 0);
            const availableMinutes = maxMinutesPerDay - usedMinutes;
            
            if (availableMinutes >= 15) {
              dayEntry.slots.push({
                standard: new mongoose.Types.ObjectId(standardId),
                minutes: 15,
                completed: false
              });
            }
          }
        }
      });
    });
  });

  // Sort daily schedule by date
  dailySchedule.sort((a, b) => a.date - b.date);

  // Create milestones
  const milestones = [];
  const quarterPoint = Math.floor(daysUntilExam / 4);
  const halfPoint = Math.floor(daysUntilExam / 2);
  const threeQuarterPoint = Math.floor(daysUntilExam * 3 / 4);

  if (quarterPoint > 0) {
    const milestoneDate = new Date(today);
    milestoneDate.setDate(milestoneDate.getDate() + quarterPoint);
    milestones.push({
      date: milestoneDate,
      label: '25% Complete',
      achieved: false
    });
  }

  if (halfPoint > 0) {
    const milestoneDate = new Date(today);
    milestoneDate.setDate(milestoneDate.getDate() + halfPoint);
    milestones.push({
      date: milestoneDate,
      label: '50% Complete',
      achieved: false
    });
  }

  if (threeQuarterPoint > 0) {
    const milestoneDate = new Date(today);
    milestoneDate.setDate(milestoneDate.getDate() + threeQuarterPoint);
    milestones.push({
      date: milestoneDate,
      label: '75% Complete',
      achieved: false
    });
  }

  // Create revision plan
  const plan = await RevisionPlan.create({
    school: schoolId,
    student: studentId,
    subject: subjectId,
    examDate: exam,
    examLabel: examLabel || 'Exam',
    generatedDate: new Date(),
    daysUntilExam,
    topics,
    dailySchedule,
    milestones,
    status: 'active',
    createdBy: createdByUserId
  });

  return await RevisionPlan.findById(plan._id)
    .populate('student', 'firstName lastName studentId')
    .populate('subject', 'name code')
    .populate('topics.standard', 'name code description')
    .populate('dailySchedule.slots.standard', 'name code');
}

/**
 * Get plan by id (ensure student or teacher/admin and school).
 */
export async function getPlan(planId, schoolId) {
  const plan = await RevisionPlan.findOne({
    _id: planId,
    school: schoolId
  })
    .populate('student', 'firstName lastName studentId currentClass')
    .populate('subject', 'name code')
    .populate('topics.standard', 'name code description')
    .populate('dailySchedule.slots.standard', 'name code')
    .populate('createdBy', 'firstName lastName email role');

  return plan;
}

/**
 * Get all plans for a student.
 */
export async function getStudentPlans(studentId, schoolId, status = null) {
  const query = {
    school: schoolId,
    student: studentId
  };

  if (status) {
    query.status = status;
  }

  const plans = await RevisionPlan.find(query)
    .populate('subject', 'name code')
    .sort({ examDate: 1 });

  return plans;
}

/**
 * Get all plans for students in a teacher's classes.
 */
export async function getTeacherStudentPlans(teacherId, schoolId, options = {}) {
  const { classId, subjectId, status } = options;

  // Get classes this teacher teaches
  const Teacher = (await import('../models/Teacher.js')).default;
  const teacher = await Teacher.findOne({
    school: schoolId,
    user: teacherId
  }).populate('assignedClasses.class');

  if (!teacher) {
    throw new Error('Teacher not found');
  }

  // Get student IDs from teacher's classes
  const classIds = teacher.assignedClasses.map(ac => ac.class._id);
  
  if (classId && !classIds.some(cid => cid.toString() === classId.toString())) {
    throw new Error('Teacher does not teach this class');
  }

  const studentQuery = {
    school: schoolId,
    currentClass: classId || { $in: classIds }
  };

  const students = await Student.find(studentQuery).select('_id');
  const studentIds = students.map(s => s._id);

  const planQuery = {
    school: schoolId,
    student: { $in: studentIds }
  };

  if (subjectId) {
    planQuery.subject = subjectId;
  }

  if (status) {
    planQuery.status = status;
  }

  const plans = await RevisionPlan.find(planQuery)
    .populate('student', 'firstName lastName studentId currentClass')
    .populate('subject', 'name code')
    .populate('createdBy', 'firstName lastName')
    .sort({ examDate: 1 });

  return plans;
}

/**
 * Update progress: mark topic or daily slot as completed.
 */
export async function updateProgress(planId, updates, schoolId) {
  const plan = await RevisionPlan.findOne({
    _id: planId,
    school: schoolId
  });

  if (!plan) {
    throw new Error('Revision plan not found');
  }

  if (updates.topicIndex !== undefined) {
    // Mark topic as completed
    const topicIndex = updates.topicIndex;
    if (topicIndex >= 0 && topicIndex < plan.topics.length) {
      plan.topics[topicIndex].completed = updates.completed !== false;
      if (plan.topics[topicIndex].completed) {
        plan.topics[topicIndex].completedAt = new Date();
      } else {
        plan.topics[topicIndex].completedAt = null;
      }
    }
  }

  if (updates.date && updates.standardId) {
    // Mark daily slot as completed
    const slotDate = new Date(updates.date);
    slotDate.setHours(0, 0, 0, 0);

    const dayEntry = plan.dailySchedule.find(d => {
      const dDate = new Date(d.date);
      dDate.setHours(0, 0, 0, 0);
      return dDate.getTime() === slotDate.getTime();
    });

    if (dayEntry) {
      const slot = dayEntry.slots.find(s => 
        s.standard.toString() === updates.standardId.toString()
      );

      if (slot) {
        slot.completed = updates.completed !== false;
      }
    }
  }

  // Update milestones
  const completedTopics = plan.topics.filter(t => t.completed).length;
  const totalTopics = plan.topics.length;
  const completionPercentage = totalTopics > 0 ? (completedTopics / totalTopics) * 100 : 0;

  plan.milestones.forEach(milestone => {
    const milestoneDate = new Date(milestone.date);
    milestoneDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (milestoneDate <= today && !milestone.achieved) {
      if (milestone.label.includes('25%') && completionPercentage >= 25) {
        milestone.achieved = true;
      } else if (milestone.label.includes('50%') && completionPercentage >= 50) {
        milestone.achieved = true;
      } else if (milestone.label.includes('75%') && completionPercentage >= 75) {
        milestone.achieved = true;
      }
    }
  });

  // Update status
  if (completionPercentage >= 100) {
    plan.status = 'completed';
  }

  await plan.save();

  return await getPlan(planId, schoolId);
}

/**
 * Get resource recommendations for a concept.
 */
export async function getRecommendations(studentId, conceptId, schoolId) {
  const standard = await Standard.findOne({
    _id: conceptId,
    school: schoolId
  }).populate('subject');

  if (!standard) {
    throw new Error('Standard not found');
  }

  // Simple recommendations - can be enhanced with AI later
  const recommendations = [
    {
      type: 'practice',
      title: 'Practice Questions',
      description: `Complete practice questions for ${standard.name}`,
      action: 'practice'
    },
    {
      type: 'review',
      title: 'Review Notes',
      description: `Review your notes and materials for ${standard.name}`,
      action: 'review'
    },
    {
      type: 'video',
      title: 'Watch Tutorial',
      description: `Find a tutorial video explaining ${standard.name}`,
      action: 'video'
    }
  ];

  return recommendations;
}
