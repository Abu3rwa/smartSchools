import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import spellingAnalysisService from '../../../services/spellingAnalysisService';
import AnalysisToolbar from './components/AnalysisToolbar';
import ClassComparisonSection from './components/ClassComparisonSection';
import RankingSection from './components/RankingSection';
import RunPanel from './components/RunPanel';
import StudentAnalysisModal from './components/StudentAnalysisModal';
import './SpellingAnalysisPage.css';

const currentMonth = () => new Date().toISOString().slice(0, 7);

const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;

export default function SpellingAnalysisPage() {
    const { t, i18n } = useTranslation(['spellingAnalysis']);
    const language = String(i18n.language || 'en').startsWith('ar') ? 'ar' : 'en';
    const [month, setMonth] = useState(currentMonth);
    const [allTime, setAllTime] = useState(false);
    const [grade, setGrade] = useState('');
    const [grades, setGrades] = useState([]);
    const [students, setStudents] = useState([]);
    const [cohort, setCohort] = useState(null);
    const [loading, setLoading] = useState(true);
    const [runningId, setRunningId] = useState('');
    const [batch, setBatch] = useState(null);
    const [narrative, setNarrative] = useState({ text: '', loading: false });
    const [openStudent, setOpenStudent] = useState(null);
    const [loadError, setLoadError] = useState('');

    const window = useMemo(() => (allTime ? { kind: 'all', key: 'all' } : { kind: 'month', key: month }), [allTime, month]);

    const loadStudents = useCallback(async () => {
        setLoading(true);
        setLoadError('');
        try {
            const result = await spellingAnalysisService.listStudents({ grade: '', window });
            setStudents(result.data.students || []);
            const available = result.data.grades || [];
            setGrades(available);
            setGrade((current) => (
                available.includes(current) ? current : (available[0] || '')
            ));
        } catch (error) {
            setLoadError(errorMessage(error, t('spellingAnalysis:errors.load')));
        } finally {
            setLoading(false);
        }
    }, [window, t]);

    const loadCohort = useCallback(async (selectedGrade) => {
        if (!selectedGrade) {
            setCohort(null);
            return;
        }
        try {
            const result = await spellingAnalysisService.getCohort({ grade: selectedGrade, window });
            setCohort(result.data);
        } catch (error) {
            toast.error(errorMessage(error, t('spellingAnalysis:errors.load')));
            setCohort(null);
        }
    }, [window, t]);

    useEffect(() => {
        setNarrative({ text: '', loading: false });
        loadStudents();
    }, [loadStudents]);

    useEffect(() => {
        setNarrative({ text: '', loading: false });
        loadCohort(grade);
    }, [grade, loadCohort]);

    const refreshAll = useCallback(async () => {
        await loadStudents();
        await loadCohort(grade);
    }, [loadStudents, loadCohort, grade]);

    const runOne = async (studentId, { force = false } = {}) => {
        setRunningId(studentId);
        try {
            const result = await spellingAnalysisService.runStudent({ studentId, window, language, force });
            if (result.data?.cached) toast.success(t('spellingAnalysis:run.cached'));
            await refreshAll();
            return true;
        } catch (error) {
            toast.error(errorMessage(error, t('spellingAnalysis:errors.run')));
            if (error?.response?.data?.code === 'AI_CREDIT_REQUIRED' || error?.response?.data?.code === 'AI_CREDIT_PAUSED') {
                return false;
            }
            return true;
        } finally {
            setRunningId('');
        }
    };

    const runMissing = async () => {
        const queue = students.filter((student) => (
            student.grade === grade
            && (!student.analysis || student.analysis.stale || student.analysis.status === 'failed')
        ));
        if (!queue.length) {
            toast(t('spellingAnalysis:run.nothingToRun'));
            return;
        }
        setBatch({ total: queue.length, done: 0 });
        for (let index = 0; index < queue.length; index += 1) {
            const keepGoing = await runOne(queue[index].studentId);
            setBatch({ total: queue.length, done: index + 1 });
            if (!keepGoing) break;
        }
        setBatch(null);
        await refreshAll();
    };

    const explain = async () => {
        setNarrative((current) => ({ ...current, loading: true }));
        try {
            const result = await spellingAnalysisService.explainCohort({ grade, window, language });
            setNarrative({ text: result.data.text, loading: false });
        } catch (error) {
            setNarrative((current) => ({ ...current, loading: false }));
            toast.error(errorMessage(error, t('spellingAnalysis:errors.explain')));
        }
    };

    const gradeStudents = students.filter((student) => student.grade === grade);
    const pendingCount = gradeStudents.filter((student) => (
        !student.analysis || student.analysis.stale || student.analysis.status === 'failed'
    )).length;

    return (
        <div className="sa-page">
            <header className="sa-head">
                <div>
                    <h1>{t('spellingAnalysis:title')}</h1>
                    <p>{t('spellingAnalysis:subtitle')}</p>
                </div>
                <span className="sa-credit-note">{t('spellingAnalysis:run.creditNote')}</span>
            </header>

            <AnalysisToolbar
                month={month}
                allTime={allTime}
                grade={grade}
                grades={grades}
                loading={loading}
                onAllTimeChange={setAllTime}
                onGradeChange={setGrade}
                onMonthChange={(value) => {
                    setAllTime(false);
                    setMonth(value);
                }}
                onRefresh={refreshAll}
            />

            {loadError && <p className="sa-error">{loadError}</p>}

            <RunPanel
                batch={batch}
                loading={loading}
                onRun={(studentId) => runOne(studentId)}
                onRunMissing={runMissing}
                onView={setOpenStudent}
                pendingCount={pendingCount}
                runningId={runningId}
                students={gradeStudents}
            />

            <RankingSection
                minAttempts={cohort?.ranking?.minAttempts || 0}
                onView={setOpenStudent}
                ranking={cohort?.ranking || null}
            />

            <ClassComparisonSection
                classes={cohort?.classes || []}
                explaining={narrative.loading}
                grades={cohort?.grades || []}
                narrative={narrative.text}
                onExplain={explain}
            />

            {openStudent && (
                <StudentAnalysisModal
                    language={language}
                    onClose={() => setOpenStudent(null)}
                    studentId={openStudent}
                    window={window}
                />
            )}
        </div>
    );
}
