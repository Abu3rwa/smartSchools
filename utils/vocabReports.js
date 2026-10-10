// Pure report aggregations over logged attempts. "Use it" attempts (correct === null) are never counted as right or wrong.

const graded = (attempts) => attempts.filter((attempt) => attempt.correct === true || attempt.correct === false);
const pct = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : null);

export const classOverview = (attempts, listIds, studentCount) => listIds.map((listId) => {
    const inList = attempts.filter((attempt) => attempt.listId === listId);
    const scored = graded(inList);
    const correct = scored.filter((attempt) => attempt.correct).length;
    const participants = new Set(inList.map((attempt) => String(attempt.student))).size;
    return {
        listId,
        students: studentCount,
        participants,
        participationPct: pct(participants, studentCount),
        attempts: scored.length,
        correct,
        accuracyPct: pct(correct, scored.length)
    };
});

export const wordDifficulty = (attempts, wordsById, limit = 50) => {
    const stats = new Map();
    for (const attempt of graded(attempts)) {
        if (!attempt.word) continue;
        const key = String(attempt.word);
        const entry = stats.get(key) || { wordId: key, attempts: 0, wrong: 0, wrongAnswers: new Map() };
        entry.attempts += 1;
        if (!attempt.correct) {
            entry.wrong += 1;
            const given = String(attempt.given || '').trim().toLowerCase();
            if (given) entry.wrongAnswers.set(given, (entry.wrongAnswers.get(given) || 0) + 1);
        }
        stats.set(key, entry);
    }
    return [...stats.values()]
        .filter((entry) => entry.wrong > 0)
        .map((entry) => {
            const word = wordsById.get(entry.wordId);
            return {
                wordId: entry.wordId,
                word: word?.word || '(removed)',
                listId: word?.listId || '',
                attempts: entry.attempts,
                wrong: entry.wrong,
                missPct: pct(entry.wrong, entry.attempts),
                topWrongAnswers: [...entry.wrongAnswers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([answer, count]) => ({ answer, count }))
            };
        })
        .sort((a, b) => b.wrong - a.wrong || b.missPct - a.missPct)
        .slice(0, limit);
};

export const studentDetail = (attempts, wordsById, masteryByWord, options = {}) => {
    const { threshold = 2, inactivityDays = 7, now = new Date(), stateOf } = options;
    const perWord = new Map();
    let timeMs = 0;
    for (const attempt of attempts) {
        timeMs += Number(attempt.timeMs) || 0;
        if (!attempt.word || (attempt.correct !== true && attempt.correct !== false)) continue;
        const key = String(attempt.word);
        const entry = perWord.get(key) || { attempts: 0, correct: 0 };
        entry.attempts += 1;
        if (attempt.correct) entry.correct += 1;
        perWord.set(key, entry);
    }
    const words = [...perWord.entries()].map(([wordId, entry]) => {
        const word = wordsById.get(wordId);
        const mastery = masteryByWord.get(wordId);
        return {
            wordId,
            word: word?.word || '(removed)',
            listId: word?.listId || '',
            attempts: entry.attempts,
            correct: entry.correct,
            accuracyPct: pct(entry.correct, entry.attempts),
            state: stateOf ? stateOf(mastery, { threshold, inactivityDays, now }) : (mastery?.state || 'not_started')
        };
    }).sort((a, b) => (a.accuracyPct ?? 0) - (b.accuracyPct ?? 0));
    const sessions = new Map();
    for (const attempt of graded(attempts)) {
        const entry = sessions.get(attempt.sessionId) || { sessionId: attempt.sessionId, date: attempt.createdAt, total: 0, correct: 0 };
        entry.total += 1;
        if (attempt.correct) entry.correct += 1;
        if (new Date(attempt.createdAt) > new Date(entry.date)) entry.date = attempt.createdAt;
        sessions.set(attempt.sessionId, entry);
    }
    return {
        words,
        minutesPracticed: Math.round(timeMs / 6000) / 10,
        recentSessions: [...sessions.values()].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10)
    };
};

export const mcqAnalysis = (attempts, mcqById, minAttempts = 5, lowPct = 40) => {
    const stats = new Map();
    for (const attempt of attempts) {
        if (attempt.type !== 'mcq' || !attempt.questionId) continue;
        const entry = stats.get(attempt.questionId) || { attempts: 0, correct: 0, choices: { A: 0, B: 0, C: 0, D: 0 } };
        entry.attempts += 1;
        if (attempt.correct) entry.correct += 1;
        if (attempt.choice && entry.choices[attempt.choice] !== undefined) entry.choices[attempt.choice] += 1;
        stats.set(attempt.questionId, entry);
    }
    return [...stats.entries()].map(([questionId, entry]) => {
        const question = mcqById.get(questionId);
        const correctPct = pct(entry.correct, entry.attempts);
        return {
            questionId,
            question: question?.question || '(removed)',
            correctKey: question?.correct || '',
            attempts: entry.attempts,
            correctPct,
            choices: entry.choices,
            lowScore: entry.attempts >= minAttempts && correctPct < lowPct
        };
    }).sort((a, b) => a.correctPct - b.correctPct);
};

export const inactiveStudents = (students, lastSeenByStudent, days, now = new Date()) => {
    const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
    return students
        .map((student) => ({ student, lastSeen: lastSeenByStudent.get(String(student._id)) || null }))
        .filter(({ lastSeen }) => !lastSeen || new Date(lastSeen).getTime() < cutoff)
        .map(({ student, lastSeen }) => ({
            studentId: String(student._id),
            name: `${student.firstName || ''} ${student.lastName || ''}`.trim(),
            lastPracticed: lastSeen
        }));
};

export const REPORT_TABLES = {
    overview: { headers: ['list_id', 'students', 'participants', 'participation_pct', 'graded_attempts', 'correct', 'accuracy_pct'], row: (r) => [r.listId, r.students, r.participants, r.participationPct ?? '', r.attempts, r.correct, r.accuracyPct ?? ''] },
    words: { headers: ['word', 'list_id', 'attempts', 'wrong', 'miss_pct', 'most_common_wrong_answers'], row: (r) => [r.word, r.listId, r.attempts, r.wrong, r.missPct ?? '', r.topWrongAnswers.map((entry) => `${entry.answer} (${entry.count})`).join('; ')] },
    student: { headers: ['word', 'list_id', 'attempts', 'correct', 'accuracy_pct', 'state'], row: (r) => [r.word, r.listId, r.attempts, r.correct, r.accuracyPct ?? '', r.state] },
    mcq: { headers: ['question_id', 'question', 'correct_option', 'attempts', 'correct_pct', 'chose_A', 'chose_B', 'chose_C', 'chose_D', 'low_score'], row: (r) => [r.questionId, r.question, r.correctKey, r.attempts, r.correctPct ?? '', r.choices.A, r.choices.B, r.choices.C, r.choices.D, r.lowScore ? 'yes' : ''] },
    inactive: { headers: ['student', 'last_practiced'], row: (r) => [r.name, r.lastPracticed ? new Date(r.lastPracticed).toISOString().slice(0, 10) : 'never'] }
};
