import { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import {
    fetchLessons,
    selectLessons,
    selectLessonsLoading
} from '../../../store/slices/lessonSlice';
import { selectUser } from '../../../store/slices/authSlice';
import { selectCurrentAcademicYear, selectAppName } from '../../../store/slices/uiSlice';
import { HiOutlineArrowLeft, HiOutlinePrinter, HiOutlineCalendar, HiOutlineAcademicCap, HiOutlineBookOpen, HiOutlineUser } from 'react-icons/hi';
import { format } from 'date-fns';
import { SAAS_URL } from './constants';
import './LessonPlanDetailPage.css';

const Section = ({ title, content }) => {
    if (!content || !String(content).trim()) return null;
    return (
        <div className="lp-section">
            <div className="lp-section-title">{title}</div>
            <div className="lp-section-body">{content}</div>
        </div>
    );
};

const LessonPlanDetailPage = () => {
    const { t } = useTranslation(['lessonPlan']);
    const { id } = useParams();
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const lessons = useSelector(selectLessons);
    const loading = useSelector(selectLessonsLoading);
    const user = useSelector(selectUser);
    const academicYear = useSelector(selectCurrentAcademicYear);
    const appName = useSelector(selectAppName);
    const printRef = useRef(null);

    useEffect(() => {
        if (!lessons.length) {
            dispatch(fetchLessons({ academicYear }));
        }
    }, [dispatch, academicYear, lessons.length]);

    const lesson = lessons.find(l => l._id === id);

    const school = user?.school || {};
    const schoolName = school.name || t('lessonPlan:detail.schoolFallback');
    const schoolLogo = school.logo || school.logoUrl || null;

    const handlePrint = () => {
        window.print();
    };

    if (loading) {
        return (
            <div className="lp-detail-page">
                <div className="loading-container"><div className="spinner" /></div>
            </div>
        );
    }

    if (!lesson) {
        return (
            <div className="lp-detail-page">
                <div className="page-header">
                    <button className="btn btn-ghost btn-sm" onClick={() => navigate('/portal/lessons')}>
                        <HiOutlineArrowLeft size={18} />{t('lessonPlan:detail.back')}
                    </button>
                </div>
                <div className="error-container">
                    <p className="error-message">{t('lessonPlan:detail.notFound')}</p>
                </div>
            </div>
        );
    }

    const dateStr = lesson.date
        ? format(new Date(lesson.date), 'EEEE, MMMM d, yyyy')
        : t('lessonPlan:common.emptySymbol');
    const teacherName = lesson.teacher
        ? `${lesson.teacher.firstName || ''} ${lesson.teacher.lastName || ''}`.trim()
        : null;

    return (
        <div className="lp-detail-page">
            {/* Screen-only toolbar */}
            <div className="lp-toolbar no-print">
                <button className="btn btn-ghost btn-sm" onClick={() => navigate('/portal/lessons')}>
                    <HiOutlineArrowLeft size={18} /> {t('lessonPlan:detail.backToLessons')}
                </button>
                <button className="btn btn-primary" onClick={handlePrint}>
                    <HiOutlinePrinter size={18} /> {t('lessonPlan:detail.print')}
                </button>
            </div>

            {/* Printable content */}
            <div className="lp-print-wrapper" ref={printRef}>

                {/* ── HEADER ─────────────────────────────────── */}
                <div className="lp-header">
                    <div className="lp-header-left">
                        {schoolLogo ? (
                            <img src={schoolLogo} alt="School Logo" className="lp-school-logo" />
                        ) : (
                            <div className="lp-school-logo-placeholder">
                                <HiOutlineAcademicCap size={36} />
                            </div>
                        )}
                        <div>
                            <div className="lp-school-name">{schoolName}</div>
                            <div className="lp-doc-type">{t('lessonPlan:detail.documentType')}</div>
                        </div>
                    </div>
                    <div className="lp-header-right">
                        <div className="lp-saas-brand">
                            Powered by <strong>{appName}</strong>
                            <span className="lp-saas-url"> · {SAAS_URL}</span>
                        </div>
                    </div>
                </div>

                {/* ── META STRIP ──────────────────────────────── */}
                <div className="lp-meta-strip">
                    <div className="lp-meta-item">
                        <HiOutlineCalendar size={15} />
                        <span>{dateStr}</span>
                    </div>
                    <div className="lp-meta-item">
                        <HiOutlineBookOpen size={15} />
                        <span>{t('lessonPlan:table.subject')}: <strong>{lesson.subject?.name || t('lessonPlan:common.emptySymbol')}</strong></span>
                    </div>
                    <div className="lp-meta-item">
                        <HiOutlineAcademicCap size={15} />
                        <span>{t('lessonPlan:table.class')}: <strong>{lesson.class?.name || t('lessonPlan:common.emptySymbol')}</strong></span>
                    </div>
                    {teacherName && (
                        <div className="lp-meta-item">
                            <HiOutlineUser size={15} />
                            <span>{t('lessonPlan:table.teacher')}: <strong>{teacherName}</strong></span>
                        </div>
                    )}
                    <div className={`lp-status-chip status-${lesson.status || 'draft'}`}>
                        {t(`lessonPlan:status.${lesson.status || 'draft'}`, {
                            defaultValue: (lesson.status || 'draft').replace('_', ' ')
                        })}
                    </div>
                </div>

                {/* ── TITLE ───────────────────────────────────── */}
                <h1 className="lp-title">{lesson.title}</h1>

                {/* ── INFO GRID ───────────────────────────────── */}
                <div className="lp-info-grid">
                    <Section title={t('lessonPlan:detail.sections.summary')} content={lesson.summary} />
                    <Section title={t('lessonPlan:detail.sections.previousKnowledge')} content={lesson.previousKnowledge} />
                    <Section title={t('lessonPlan:detail.sections.teachingObjectives')} content={lesson.teachingObjectives} />
                    <Section title={t('lessonPlan:detail.sections.vocabulary')} content={lesson.vocabulary} />
                    <Section title={t('lessonPlan:detail.sections.characterTraitLinks')} content={lesson.characterTraitLinks} />
                    <Section title={t('lessonPlan:detail.sections.techIntegration')} content={lesson.techIntegration} />
                </div>

                {/* ── DESCRIPTION ─────────────────────────────── */}
                {lesson.description && (
                    <div className="lp-full-section">
                        <div className="lp-section-title">{t('lessonPlan:detail.sections.description')}</div>
                        <div className="lp-section-body">{lesson.description}</div>
                    </div>
                )}

                {/* ── STANDARDS ───────────────────────────────── */}
                {Array.isArray(lesson.standardIds) && lesson.standardIds.length > 0 && (
                    <div className="lp-full-section">
                        <div className="lp-section-title">{t('lessonPlan:detail.sections.standards')}</div>
                        <div className="lp-standards-list">
                            {lesson.standardIds.map((s, i) => {
                                const obj = typeof s === 'object' ? s : null;
                                return (
                                    <div key={i} className="lp-standard-chip">
                                        {obj?.code || obj?.name || String(s)}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* ── STAGES ──────────────────────────────────── */}
                {Array.isArray(lesson.stages) && lesson.stages.length > 0 && (
                    <div className="lp-full-section">
                        <div className="lp-section-title lp-section-title--large">
                            {t('lessonPlan:detail.sections.stagesTitle')}
                        </div>
                        <table className="lp-stages-table">
                            <thead>
                                <tr>
                                    <th>{t('lessonPlan:detail.stages.stage')}</th>
                                    <th>{t('lessonPlan:detail.stages.procedure')}</th>
                                    <th>{t('lessonPlan:detail.stages.materials')}</th>
                                    <th>{t('lessonPlan:detail.stages.timing')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {lesson.stages.map((stage, i) => (
                                    <tr key={i}>
                                        <td className="lp-stage-name">{stage.name || t('lessonPlan:detail.stages.stageNumber', { number: i + 1 })}</td>
                                        <td>{stage.procedure || t('lessonPlan:common.emptySymbol')}</td>
                                        <td>{stage.materials || t('lessonPlan:common.emptySymbol')}</td>
                                        <td className="lp-stage-timing">{stage.timing || t('lessonPlan:common.emptySymbol')}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* ── HOMEWORK ────────────────────────────────── */}
                {lesson.homework && (
                    <div className="lp-full-section">
                        <div className="lp-section-title">{t('lessonPlan:detail.sections.homework')}</div>
                        <div className="lp-section-body lp-homework-box">{lesson.homework}</div>
                    </div>
                )}

                {/* ── ADMIN NOTE TO TEACHER ──────────────────── */}
                {lesson.adminNoteToTeacher && (
                    <div className="lp-full-section lp-admin-note-section">
                        <div className="lp-section-title">{t('lessonPlan:detail.sections.adminNote')}</div>
                        <div className="lp-section-body lp-admin-note-box">{lesson.adminNoteToTeacher}</div>
                    </div>
                )}

                {/* ── FOOTER ──────────────────────────────────── */}
                <div className="lp-footer">
                    <div className="lp-footer-left">
                        {schoolName} &nbsp;·&nbsp; {dateStr}
                    </div>
                    <div className="lp-footer-right lp-saas-watermark">
                        {appName} &nbsp;·&nbsp; {SAAS_URL}
                    </div>
                </div>

            </div>{/* end lp-print-wrapper */}
        </div>
    );
};

export default LessonPlanDetailPage;
