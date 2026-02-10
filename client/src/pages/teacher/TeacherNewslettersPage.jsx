import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import toast from 'react-hot-toast';

import { fetchClasses, selectClasses } from '../../store/slices/classSlice';
import { fetchSubjects, selectSubjects } from '../../store/slices/subjectSlice';
import { fetchLessons, selectLessons, selectLessonsLoading } from '../../store/slices/lessonSlice';
import { selectCurrentAcademicYear } from '../../store/slices/uiSlice';

import {
  fetchIssue,
  generateSection,
  submitSection,
  selectTeacherNewsletter
} from '../../store/slices/newsletterSlice';

import './TeacherNewslettersPage.css';

const LANG_OPTIONS = [
  { value: 'english', label: 'English' },
  { value: 'arabic', label: 'Arabic' },
  { value: 'bilingual', label: 'Bilingual' }
];

const TeacherNewslettersPage = () => {
  const dispatch = useDispatch();
  const academicYear = useSelector(selectCurrentAcademicYear);
  const classes = useSelector(selectClasses);
  const subjects = useSelector(selectSubjects);
  const lessons = useSelector(selectLessons);
  const lessonsLoading = useSelector(selectLessonsLoading);
  const teacherNewsletter = useSelector(selectTeacherNewsletter);

  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [language, setLanguage] = useState('english');
  const [weekDate, setWeekDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedLessonIds, setSelectedLessonIds] = useState([]);

  const weekStart = useMemo(() => startOfWeek(new Date(weekDate), { weekStartsOn: 1 }), [weekDate]);
  const weekEnd = useMemo(() => endOfWeek(new Date(weekDate), { weekStartsOn: 1 }), [weekDate]);

  const weekStartStr = useMemo(() => format(weekStart, 'yyyy-MM-dd'), [weekStart]);
  const weekEndStr = useMemo(() => format(weekEnd, 'yyyy-MM-dd'), [weekEnd]);

  useEffect(() => {
    dispatch(fetchClasses({ academicYear }));
    dispatch(fetchSubjects());
  }, [dispatch, academicYear]);

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

  const onGenerate = async () => {
    if (!classId || !subjectId) {
      toast.error('Please select class and subject');
      return;
    }
    try {
      await dispatch(generateSection({
        classId,
        subjectId,
        academicYear,
        weekStart: weekStartStr,
        language,
        selectedLessonPlanIds: selectedLessonIds
      })).unwrap();
      toast.success('Section generated');
      dispatch(fetchIssue({ classId, academicYear, weekStart: weekStartStr }));
    } catch (e) {
      toast.error(e || 'Generation failed');
    }
  };

  const onSubmit = async () => {
    if (!mySection?._id) {
      toast.error('Generate a section first');
      return;
    }
    try {
      await dispatch(submitSection({ sectionId: mySection._id })).unwrap();
      toast.success('Submitted to admin');
      dispatch(fetchIssue({ classId, academicYear, weekStart: weekStartStr }));
    } catch (e) {
      toast.error(e || 'Submit failed');
    }
  };

  return (
    <div className="teacher-newsletters-page">
      <div className="tn-header">
        <h2>Weekly Newsletters</h2>
        <p>Generate a 100–120 word summary per subject and submit for admin review.</p>
      </div>

      <div className="tn-grid">
        <div className="tn-card">
          <h3>1) Select</h3>
          <div className="tn-field">
            <label>Week (pick any date in the week)</label>
            <input type="date" value={weekDate} onChange={(e) => setWeekDate(e.target.value)} />
            <div className="tn-subtext">Week range: {weekStartStr} → {weekEndStr}</div>
          </div>

          <div className="tn-field">
            <label>Class</label>
            <select value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">Select class</option>
              {classes.map((c) => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="tn-field">
            <label>Subject</label>
            <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">Select subject</option>
              {subjects.map((s) => (
                <option key={s._id} value={s._id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="tn-field">
            <label>Language</label>
            <select value={language} onChange={(e) => setLanguage(e.target.value)}>
              {LANG_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className="tn-actions">
            <button className="tn-btn primary" onClick={onGenerate} disabled={teacherNewsletter.generating}>
              {teacherNewsletter.generating ? 'Generating...' : 'Generate with AI'}
            </button>
            <button className="tn-btn" onClick={onSubmit} disabled={teacherNewsletter.submitting || mySection?.status !== 'draft'}>
              {teacherNewsletter.submitting ? 'Submitting...' : 'Submit to Admin'}
            </button>
          </div>

          {mySection?.status && (
            <div className="tn-status">
              Current status: <strong>{mySection.status}</strong>
              {mySection.wordCount ? <span> • {mySection.wordCount} words</span> : null}
            </div>
          )}
        </div>

        <div className="tn-card">
          <h3>2) Pick lesson plans</h3>
          <div className="tn-subtext">
            If you select none, the system will use all lesson plans in the week for the chosen class/subject.
          </div>

          {lessonsLoading ? (
            <div className="tn-muted">Loading lesson plans...</div>
          ) : (lessons.length === 0 ? (
            <div className="tn-muted">No lesson plans found for this week.</div>
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
          <h3>3) Preview</h3>
          {mySection?.content ? (
            <div className="tn-preview">
              {mySection.content}
            </div>
          ) : (
            <div className="tn-muted">Generate a section to preview it here.</div>
          )}
          {mySection?.adminReview?.notes ? (
            <div className="tn-review-notes">
              <strong>Admin notes:</strong> {mySection.adminReview.notes}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default TeacherNewslettersPage;

