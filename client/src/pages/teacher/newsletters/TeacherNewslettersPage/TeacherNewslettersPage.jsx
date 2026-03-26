import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

import { selectClasses } from '../../../../store/slices/classSlice';
import { selectSubjects } from '../../../../store/slices/subjectSlice';
import { fetchLessons, selectLessons, selectLessonsLoading } from '../../../../store/slices/lessonSlice';
import { selectCurrentAcademicYear } from '../../../../store/slices/uiSlice';

import {
  fetchIssue,
  generateSection,
  updateSectionContent,
  submitSection,
  selectTeacherNewsletter
} from '../../../../store/slices/newsletterSlice';
import { AI_LANGUAGE_OPTIONS, buildRequestedLanguages, toLegacyLanguageValue } from '../../../../constants/aiLanguages';

import './TeacherNewslettersPage.css';

const TeacherNewslettersPage = () => {
  const { t } = useTranslation(['newsletters']);
  const dispatch = useDispatch();
  const academicYear = useSelector(selectCurrentAcademicYear);
  const classes = useSelector(selectClasses);
  const subjects = useSelector(selectSubjects);
  const lessons = useSelector(selectLessons);
  const lessonsLoading = useSelector(selectLessonsLoading);
  const teacherNewsletter = useSelector(selectTeacherNewsletter);

  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [primaryLanguage, setPrimaryLanguage] = useState('en');
  const [secondaryLanguage, setSecondaryLanguage] = useState('');
  const [weekDate, setWeekDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedLessonIds, setSelectedLessonIds] = useState([]);
  const [customPrompt, setCustomPrompt] = useState('');
  const [editableContent, setEditableContent] = useState('');
  const [savingContent, setSavingContent] = useState(false);

  const weekStart = useMemo(() => startOfWeek(new Date(weekDate), { weekStartsOn: 1 }), [weekDate]);
  const weekEnd = useMemo(() => endOfWeek(new Date(weekDate), { weekStartsOn: 1 }), [weekDate]);

  const weekStartStr = useMemo(() => format(weekStart, 'yyyy-MM-dd'), [weekStart]);
  const weekEndStr = useMemo(() => format(weekEnd, 'yyyy-MM-dd'), [weekEnd]);

  useEffect(() => {
    if (!classId) return;
    dispatch(fetchIssue({ classId, academicYear, weekStart: weekStartStr }));
  }, [dispatch, classId, academicYear, weekStartStr]);

  useEffect(() => {
    if (!classId || !subjectId) return;
    setSelectedLessonIds([]);
    dispatch(fetchLessons({
      academicYear,
      class: classId,
      subject: subjectId,
      startDate: weekStartStr,
      endDate: weekEndStr
    }));
  }, [dispatch, academicYear, classId, subjectId, weekStartStr, weekEndStr]);

  const classSubjectOptions = useMemo(() => {
    if (!classId) return [];

    const selectedClass = classes.find((c) => c._id === classId);
    const classSubjectIds = new Set((selectedClass?.subjects || []).map((s) => s?.subject?._id || s?.subject).filter(Boolean).map((id) => id.toString()));
    const teacherSubjectIds = new Set((subjects || []).map((s) => s._id?.toString()).filter(Boolean));

    return (subjects || []).filter((s) => classSubjectIds.has(s._id?.toString()) && teacherSubjectIds.has(s._id?.toString()));
  }, [classId, classes, subjects]);

  useEffect(() => {
    if (!subjectId) return;
    const isStillValid = classSubjectOptions.some((s) => s._id === subjectId);
    if (!isStillValid) setSubjectId('');
  }, [classSubjectOptions, subjectId]);

  const toggleLesson = (lessonId) => {
    setSelectedLessonIds((prev) => prev.includes(lessonId)
      ? prev.filter((id) => id !== lessonId)
      : [...prev, lessonId]
    );
  };

  const mySection = useMemo(() => {
    const sections = teacherNewsletter.sections || [];
    return sections.find((s) => (s.subject?._id || s.subject) === subjectId) || teacherNewsletter.lastGeneratedSection;
  }, [teacherNewsletter.sections, teacherNewsletter.lastGeneratedSection, subjectId]);

  useEffect(() => {
    setEditableContent(mySection?.content || '');
    setCustomPrompt(mySection?.customPrompt || '');
  }, [mySection?._id, mySection?.content, mySection?.customPrompt]);

  const onGenerate = async ({ useFeedback = false } = {}) => {
    if (!classId || !subjectId) {
      toast.error(t('newsletters:teacher.toasts.selectClassSubject'));
      return;
    }
    try {
      const requestedLanguages = buildRequestedLanguages(primaryLanguage, secondaryLanguage);
      const normalizedRequestedLanguages = requestedLanguages.length > 0 ? requestedLanguages : ['en'];
      await dispatch(generateSection({
        classId,
        subjectId,
        academicYear,
        weekStart: weekStartStr,
        requestedLanguages: normalizedRequestedLanguages,
        primaryLanguage,
        secondaryLanguage,
        language: toLegacyLanguageValue(normalizedRequestedLanguages),
        selectedLessonPlanIds: selectedLessonIds,
        customPrompt,
        regenerateWithFeedback: useFeedback
      })).unwrap();
      toast.success(t('newsletters:teacher.toasts.sectionGenerated'));
      dispatch(fetchIssue({ classId, academicYear, weekStart: weekStartStr }));
    } catch (e) {
      toast.error(e || t('newsletters:teacher.toasts.generationFailed'));
    }
  };

  const onSaveContent = async () => {
    if (!mySection?._id) {
      toast.error(t('newsletters:teacher.toasts.generateFirst'));
      return;
    }

    const trimmed = (editableContent || '').trim();
    if (!trimmed) {
      toast.error(t('newsletters:teacher.toasts.contentRequired'));
      return;
    }

    try {
      setSavingContent(true);
      await dispatch(updateSectionContent({
        sectionId: mySection._id,
        content: trimmed,
        customPrompt
      })).unwrap();
      toast.success(t('newsletters:teacher.toasts.draftUpdated'));
      dispatch(fetchIssue({ classId, academicYear, weekStart: weekStartStr }));
    } catch (e) {
      toast.error(e || t('newsletters:teacher.toasts.saveFailed'));
    } finally {
      setSavingContent(false);
    }
  };

  const onSubmit = async () => {
    if (!mySection?._id) {
      toast.error(t('newsletters:teacher.toasts.generateFirst'));
      return;
    }
    try {
      await dispatch(submitSection({ sectionId: mySection._id })).unwrap();
      toast.success(t('newsletters:teacher.toasts.submitted'));
      dispatch(fetchIssue({ classId, academicYear, weekStart: weekStartStr }));
    } catch (e) {
      toast.error(e || t('newsletters:teacher.toasts.submitFailed'));
    }
  };

  return (
    <div className="teacher-newsletters-page">
      <div className="tn-header">
        <h2>{t('newsletters:teacher.header.title')}</h2>
        <p>{t('newsletters:teacher.header.subtitle')}</p>
      </div>

      <div className="tn-grid">
        <div className="tn-card">
          <h3>{t('newsletters:teacher.sections.select')}</h3>
          <div className="tn-field">
            <label>{t('newsletters:teacher.fields.week')}</label>
            <input type="date" value={weekDate} onChange={(e) => setWeekDate(e.target.value)} />
            <div className="tn-subtext">{t('newsletters:teacher.fields.weekRange', { start: weekStartStr, end: weekEndStr })}</div>
          </div>

          <div className="tn-field">
            <label>{t('newsletters:teacher.fields.class')}</label>
            <select value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">{t('newsletters:teacher.fields.selectClass')}</option>
              {classes.map((c) => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="tn-field">
            <label>{t('newsletters:teacher.fields.subject')}</label>
            <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">{t('newsletters:teacher.fields.selectSubject')}</option>
              {classSubjectOptions.map((s) => (
                <option key={s._id} value={s._id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="tn-field">
            <label>{t('newsletters:teacher.fields.customInstructions')}</label>
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder={t('newsletters:teacher.fields.customInstructionsPlaceholder')}
            />
          </div>

          <div className="tn-field">
            <label>{t('newsletters:teacher.fields.primaryLanguage')}</label>
            <select
              value={primaryLanguage}
              onChange={(e) => {
                const nextPrimary = e.target.value;
                setPrimaryLanguage(nextPrimary);
                if (nextPrimary === secondaryLanguage) {
                  setSecondaryLanguage('');
                }
              }}
            >
              {AI_LANGUAGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className="tn-field">
            <label>{t('newsletters:teacher.fields.secondaryLanguage')}</label>
            <select value={secondaryLanguage} onChange={(e) => setSecondaryLanguage(e.target.value)}>
              <option value="">{t('newsletters:teacher.common.none')}</option>
              {AI_LANGUAGE_OPTIONS
                .filter((o) => o.value !== primaryLanguage)
                .map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
            </select>
          </div>

          <div className="tn-actions">
            <button className="tn-btn primary" onClick={() => onGenerate()} disabled={teacherNewsletter.generating}>
              {teacherNewsletter.generating ? t('newsletters:teacher.common.generating') : t('newsletters:teacher.actions.generate')}
            </button>
            <button
              className="tn-btn"
              onClick={() => onGenerate({ useFeedback: true })}
              disabled={
                teacherNewsletter.generating ||
                mySection?.status !== 'rejected' ||
                !mySection?.adminReview?.notes
              }
            >
              {t('newsletters:teacher.actions.regenerateWithFeedback')}
            </button>
            <button
              className="tn-btn"
              onClick={onSaveContent}
              disabled={savingContent || !mySection?._id || !editableContent.trim()}
            >
              {savingContent ? t('newsletters:teacher.common.saving') : t('newsletters:teacher.actions.saveDraft')}
            </button>
            <button className="tn-btn" onClick={onSubmit} disabled={teacherNewsletter.submitting || mySection?.status !== 'draft'}>
              {teacherNewsletter.submitting ? t('newsletters:teacher.common.submitting') : t('newsletters:teacher.actions.submitToAdmin')}
            </button>
          </div>

          {mySection?.status && (
            <div className="tn-status">
              {t('newsletters:teacher.status.current')}: <strong>{mySection.status}</strong>
              {mySection.wordCount ? <span> • {t('newsletters:teacher.status.words', { count: mySection.wordCount })}</span> : null}
            </div>
          )}
        </div>

        <div className="tn-card">
          <h3>{t('newsletters:teacher.sections.pickLessonPlans')}</h3>
          <div className="tn-subtext">
            {t('newsletters:teacher.sections.pickLessonPlansHint')}
          </div>

          {lessonsLoading ? (
            <div className="tn-muted">{t('newsletters:teacher.common.loadingLessonPlans')}</div>
          ) : (lessons.length === 0 ? (
            <div className="tn-muted">{t('newsletters:teacher.common.noLessonPlans')}</div>
          ) : (
            <div className="tn-list">
              {lessons.map((l) => (
                <label key={l._id} className="tn-list-item">
                  <input
                    type="checkbox"
                    checked={selectedLessonIds.includes(l._id)}
                    onChange={() => toggleLesson(l._id)}
                  />
                  <span className="tn-list-title">{l.title}</span>
                  <span className="tn-list-date">{l.date ? format(new Date(l.date), 'MMM d') : ''}</span>
                </label>
              ))}
            </div>
          ))}
        </div>

        <div className="tn-card">
          <h3>{t('newsletters:teacher.sections.preview')}</h3>
          {mySection?.content ? (
            <>
              <textarea
                className="tn-editor"
                value={editableContent}
                onChange={(e) => setEditableContent(e.target.value)}
                disabled={!mySection?._id || mySection?.status === 'approved'}
              />
              <div className="tn-preview">{editableContent}</div>
            </>
          ) : (
            <div className="tn-muted">{t('newsletters:teacher.common.generateToPreview')}</div>
          )}
          {mySection?.adminReview?.notes ? (
            <div className="tn-review-notes">
              <strong>{t('newsletters:teacher.common.adminNotes')}:</strong> {mySection.adminReview.notes}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default TeacherNewslettersPage;
