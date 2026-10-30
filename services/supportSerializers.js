const nameOf = (person) => (
    `${person?.firstName || ''} ${person?.lastName || ''}`.trim()
);

export const studentSummary = (student) => {
    if (!student) return null;
    const classRoom = student.currentClass;
    return {
        id: String(student._id),
        name: nameOf(student),
        firstName: student.firstName || '',
        lastName: student.lastName || '',
        gender: student.gender || '',
        class: classRoom?.name || '',
        grade: classRoom?.grade ?? null,
        section: classRoom?.section || '',
        academicYear: student.academicYear || '',
    };
};

const respondentLabel = (respondent) => {
    if (!respondent) return '';
    if (respondent.kind === 'internal_teacher' && respondent.teacher) {
        return nameOf(respondent.teacher) || respondent.teacher.email || '';
    }
    if (respondent.kind === 'parent') {
        return respondent.name || 'Parent';
    }
    return respondent.name || respondent.email || '';
};

export const serializeSurvey = (survey, { includeAnswers = true } = {}) => {
    if (!survey) return null;
    const cycle = survey.cycle && typeof survey.cycle === 'object' ? survey.cycle : null;
    const subject = survey.subject && typeof survey.subject === 'object' ? survey.subject : null;
    const respondent = survey.respondent && typeof survey.respondent === 'object' ? survey.respondent : null;
    const student = survey.student && typeof survey.student === 'object' ? survey.student : null;
    return {
        id: String(survey._id),
        student: student ? studentSummary(student) : null,
        audience: survey.audience,
        status: survey.status,
        round: survey.round,
        month: cycle?.month || survey.month || null,
        academicYear: cycle?.academicYear || survey.academicYear || '',
        dueDate: survey.dueDate,
        subject: subject ? { id: String(subject._id), name: subject.name || '' } : null,
        respondentKind: respondent?.kind || '',
        respondentName: respondentLabel(respondent),
        respondentEmail: respondent?.email || '',
        questions: (survey.questions || []).map((question) => ({
            id: question.id,
            key: question.key,
            domain: question.domain,
            kind: question.kind,
            scaleMax: question.scaleMax,
            prompt: question.prompt,
            promptAr: question.promptAr,
            options: question.options || [],
            optionsAr: question.optionsAr || [],
            anchors: question.anchors || [],
            anchorsAr: question.anchorsAr || [],
            required: question.required,
            allowComment: question.allowComment,
        })),
        answers: includeAnswers
            ? (survey.answers || []).map((answer) => ({
                questionId: answer.questionId,
                scaleValue: answer.scaleValue,
                choiceIndex: answer.choiceIndex,
                choiceValue: answer.choiceValue,
                textValue: answer.textValue,
            }))
            : [],
        submittedAt: survey.submittedAt,
        lastSavedAt: survey.lastSavedAt,
    };
};

export const checkInKey = (taskId, scope) => `${scope}:${taskId}`;

export const serializePlan = (plan, checkIns = []) => {
    if (!plan) return null;
    const byTask = new Map();
    for (const checkIn of checkIns) {
        byTask.set(checkInKey(checkIn.taskId, checkIn.scope), {
            status: checkIn.status,
            note: checkIn.note || '',
            updatedAt: checkIn.updatedAt,
        });
    }

    const goals = (plan.goals || []).map((goal) => {
        const decorate = (task, scope) => {
            const state = byTask.get(checkInKey(task.id, scope)) || null;
            return {
                id: task.id,
                title: task.title,
                titleAr: task.titleAr,
                note: task.note,
                noteAr: task.noteAr,
                status: state?.status || null,
                note2: state?.note || '',
                updatedAt: state?.updatedAt || null,
            };
        };
        return {
            id: goal.id,
            concern: goal.concern,
            domain: goal.domain,
            title: goal.title,
            titleAr: goal.titleAr,
            description: goal.description,
            descriptionAr: goal.descriptionAr,
            successLook: goal.successLook,
            successLookAr: goal.successLookAr,
            homeTasks: (goal.homeTasks || []).map((task) => decorate(task, 'home')),
            classTasks: (goal.classTasks || []).map((task) => decorate(task, 'class')),
        };
    });

    const countScope = (scope) => {
        let total = 0;
        let done = 0;
        let needHelp = 0;
        for (const goal of goals) {
            const tasks = scope === 'home' ? goal.homeTasks : goal.classTasks;
            for (const task of tasks) {
                total += 1;
                if (task.status === 'done') done += 1;
                if (task.status === 'need_help') needHelp += 1;
            }
        }
        return { total, done, needHelp };
    };

    return {
        id: String(plan._id),
        cycleId: String(plan.cycle),
        month: plan.month,
        academicYear: plan.academicYear,
        status: plan.status,
        headline: plan.headline,
        summary: plan.summary,
        strengthKeys: plan.strengthKeys || [],
        focusKeys: plan.focusKeys || [],
        teacherCount: plan.teacherCount || 0,
        parentCount: plan.parentCount || 0,
        goals,
        homeProgress: countScope('home'),
        classProgress: countScope('class'),
        publishedAt: plan.publishedAt,
        updatedAt: plan.updatedAt,
    };
};

export const serializeRespondent = (respondent) => {
    if (!respondent) return null;
    return {
        id: String(respondent._id),
        kind: respondent.kind,
        name: respondentLabel(respondent),
        email: respondent.email || respondent.teacher?.email || '',
        codeHint: respondent.codeHint,
        lastAccessAt: respondent.lastAccessAt,
        active: respondent.active,
    };
};
