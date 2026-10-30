import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import i18n from '../../../../i18n/index.js';
import tutorService from '../../../../services/tutorService.js';

const unwrap = (response) => response?.data?.data;
const errorText = (error) => error?.response?.data?.message || '';

/**
 * Lesson library for one grade and subject. Importing replaces a lesson in the
 * same unit/chapter/lesson slot, so a corrected CSV updates it in place.
 */
export const useTutorLessons = ({ gradeOptions = [] }) => {
  const [grade, setGrade] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [subjects, setSubjects] = useState([]);
  const [standards, setStandards] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [loadingLessons, setLoadingLessons] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (grade || !gradeOptions.length) return;
    setGrade(String(gradeOptions[0]));
  }, [grade, gradeOptions]);

  useEffect(() => {
    if (!grade) return undefined;
    let active = true;
    setLoadingSubjects(true);
    setSubjects([]);
    setStandards([]);
    setLessons([]);
    tutorService.subjects({ grade })
      .then((response) => {
        if (!active) return;
        const rows = unwrap(response) || [];
        setSubjects(rows);
        setSubjectId((current) => (rows.some((row) => row.id === current) ? current : (rows[0]?.id || '')));
      })
      .catch(() => {
        if (!active) return;
        setSubjects([]);
        setSubjectId('');
      })
      .finally(() => { if (active) setLoadingSubjects(false); });
    return () => { active = false; };
  }, [grade]);

  useEffect(() => {
    if (!subjectId || !grade) return undefined;
    let active = true;
    setLoadingLessons(true);
    setLessons([]);
    tutorService.lessons({ grade, subjectId })
      .then((response) => { if (active) setLessons(unwrap(response) || []); })
      .catch(() => { if (active) setLessons([]); })
      .finally(() => { if (active) setLoadingLessons(false); });

    tutorService.standards({ grade, subjectId })
      .then((response) => { if (active) setStandards(unwrap(response) || []); })
      .catch(() => { if (active) setStandards([]); });
    return () => { active = false; };
  }, [grade, subjectId]);

  const reloadLessons = () => {
    if (!grade || !subjectId) return;
    setLoadingLessons(true);
    tutorService.lessons({ grade, subjectId })
      .then((response) => setLessons(unwrap(response) || []))
      .catch(() => setLessons([]))
      .finally(() => setLoadingLessons(false));
  };

  const importLessons = async ({ lessons: rows, source }) => {
    if (!grade || !subjectId) return null;
    setImporting(true);
    try {
      const data = unwrap(await tutorService.importLessons({
        subjectId,
        grade: Number(grade),
        lessons: rows,
        source
      }));
      reloadLessons();
      toast.success(i18n.t('tutor:admin.import.importSuccess', { n: data?.imported ?? rows.length }));
      return data;
    } finally {
      setImporting(false);
    }
  };

  const removeLesson = async (lessonId) => {
    try {
      await tutorService.removeLesson(lessonId);
      setLessons((current) => current.filter((row) => row.id !== lessonId));
      toast.success(i18n.t('tutor:admin.lessons.removed'));
    } catch (error) {
      toast.error(errorText(error) || i18n.t('tutor:admin.lessons.removeFailed'));
    }
  };

  const subject = subjects.find((row) => row.id === subjectId) || null;

  return {
    grade,
    setGrade,
    subjectId,
    setSubjectId,
    subjects,
    standards,
    lessons,
    subject,
    loadingSubjects,
    loadingLessons,
    importing,
    importLessons,
    removeLesson
  };
};
