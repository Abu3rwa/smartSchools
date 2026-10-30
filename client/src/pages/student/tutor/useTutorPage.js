import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import i18n from '../../../i18n/index.js';
import tutorService from '../../../services/tutorService.js';

const unwrap = (response) => response?.data?.data;
const errorText = (error) => error?.response?.data?.message || '';

/**
 * Everything the student tutor page reads and writes. The page stays a view; this
 * hook owns the fetch order (home → subject outline → history) and keeps the credit
 * balance in one place so the chip, the composer and the banner never disagree.
 */
export const useTutorPage = () => {
  const [home, setHome] = useState(null);
  const [subjectId, setSubjectId] = useState('');
  const [messages, setMessages] = useState([]);
  const [practiceSets, setPracticeSets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subjectLoading, setSubjectLoading] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState('');
  const [practice, setPractice] = useState(null);
  const [practiceBusy, setPracticeBusy] = useState(false);
  const [practiceResult, setPracticeResult] = useState(null);
  const grade = home?.grade ?? null;

  const load = useCallback(async (nextSubjectId = '') => {
    const data = unwrap(await tutorService.me(nextSubjectId ? { subjectId: nextSubjectId } : {}));
    setHome(data);
    if (!nextSubjectId && data.subjects?.length === 1) {
      setSubjectId(data.subjects[0].id);
      return data.subjects[0].id;
    }
    return nextSubjectId;
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = unwrap(await tutorService.me());
        if (!active) return;
        setHome(data);
        if (data.subjects?.length === 1) setSubjectId(data.subjects[0].id);
      } catch (fetchError) {
        if (active) setError(errorText(fetchError) || i18n.t('tutor:errors.load'));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!subjectId || !grade) return undefined;
    let active = true;
    setSubjectLoading(true);
    setPractice(null);
    setPracticeResult(null);
    (async () => {
      try {
        const [nextHome, history] = await Promise.all([
          tutorService.me({ subjectId }).then(unwrap),
          tutorService.history({ subjectId }).then(unwrap)
        ]);
        if (!active) return;
        setHome(nextHome);
        setMessages((history.conversations || []).flatMap((conversation) => conversation.messages || []));
        setPracticeSets(history.practice || []);
      } catch (fetchError) {
        if (active) setError(errorText(fetchError) || i18n.t('tutor:errors.load'));
      } finally {
        if (active) setSubjectLoading(false);
      }
    })();
    return () => { active = false; };
  }, [subjectId, grade]);

  const chooseSubject = (id) => {
    setError('');
    setMessages([]);
    setSubjectId(id);
  };

  const ask = async (questionText, lessonId = null) => {
    const question = String(questionText || '').trim();
    if (!question || asking || !subjectId) return null;
    setAsking(true);
    setError('');
    setMessages((current) => [...current, { id: `local-${Date.now()}`, role: 'student', text: question }]);
    try {
      const data = unwrap(await tutorService.ask({
        subjectId,
        question,
        lessonId: lessonId || undefined,
        language: i18n.language
      }));
      setMessages((current) => [...current, {
        id: `answer-${Date.now()}`,
        role: 'tutor',
        stage: data.stage || null,
        text: data.answer,
        lessons: data.lessons || []
      }]);
      setHome((current) => (current ? { ...current, wallet: data.balance } : current));
      if (data.balance?.notice?.level === 'empty') toast(i18n.t('tutor:credits.usedAll'), { icon: '⏳' });
      else if (data.balance?.notice?.level === 'low') {
        toast(i18n.t('tutor:credits.low', { n: data.balance.credits }), { icon: '⏳' });
      }
      return data;
    } catch (askError) {
      setError(errorText(askError) || i18n.t('tutor:errors.ask'));
      setMessages((current) => current.filter((message, index) => !(index === current.length - 1 && message.role === 'student')));
      return null;
    } finally {
      setAsking(false);
    }
  };

  const startPractice = async (lessonId = null) => {
    if (practiceBusy || !subjectId) return;
    setPracticeBusy(true);
    setError('');
    setPracticeResult(null);
    try {
      const data = unwrap(await tutorService.createPractice({
        subjectId,
        lessonId,
        language: i18n.language
      }));
      setPractice(data);
      setHome((current) => (current ? { ...current, wallet: data.balance || current.wallet } : current));
    } catch (practiceError) {
      setError(errorText(practiceError) || i18n.t('tutor:errors.practice'));
    } finally {
      setPracticeBusy(false);
    }
  };

  const submitPractice = async (answers) => {
    if (!practice || practiceBusy) return;
    setPracticeBusy(true);
    setError('');
    try {
      const data = unwrap(await tutorService.submitPractice(practice.id, answers));
      setPracticeResult(data);
      setPracticeSets((current) => [{
        id: data.id,
        subject: data.subject,
        status: 'submitted',
        score: data.score,
        total: data.total,
        submittedAt: data.submittedAt
      }, ...current]);
    } catch (submitError) {
      setError(errorText(submitError) || i18n.t('tutor:errors.practiceSubmit'));
    } finally {
      setPracticeBusy(false);
    }
  };

  return {
    home,
    loading,
    subjectId,
    subjectLoading,
    messages,
    practiceSets,
    asking,
    error,
    practice,
    practiceResult,
    practiceBusy,
    chooseSubject,
    ask,
    startPractice,
    submitPractice,
    clearPractice: () => { setPractice(null); setPracticeResult(null); },
    reload: load,
    setError
  };
};
