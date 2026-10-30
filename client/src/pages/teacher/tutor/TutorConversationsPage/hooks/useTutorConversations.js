import { useEffect, useState } from 'react';
import classService from '../../../../../services/classService.js';
import tutorService from '../../../../../services/tutorService.js';

const unwrap = (response) => response?.data?.data;
const listClasses = (payload) => {
  const raw = payload?.data ?? payload;
  if (Array.isArray(raw)) return raw;
  return raw?.classes || [];
};

/**
 * Teacher-side read of tutor conversations. The server already limits every
 * response to the classes the teacher teaches; this hook only keeps the
 * filters and the open thread in one place. Loading flags are derived from
 * the key of the finished request, so no render sets state to start loading.
 */
export const useTutorConversations = () => {
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const [listResult, setListResult] = useState({ key: '', rows: [], students: [], failed: false });
  const [activeId, setActiveId] = useState('');
  const [threadRetryKey, setThreadRetryKey] = useState(0);
  const [threadResult, setThreadResult] = useState({ key: '', data: null, failed: false });

  useEffect(() => {
    let active = true;
    classService.getClasses({ limit: 'all' })
      .then((response) => { if (active) setClasses(listClasses(response)); })
      .catch(() => { if (active) setClasses([]); });
    return () => { active = false; };
  }, []);

  const listKey = `${classId}|${studentId}|${retryKey}`;

  useEffect(() => {
    let active = true;
    tutorService.conversations({
      classId: classId || undefined,
      studentId: studentId || undefined
    })
      .then((response) => {
        if (!active) return;
        const data = unwrap(response) || {};
        setListResult({
          key: `${classId}|${studentId}|${retryKey}`,
          rows: data.conversations || [],
          students: data.students || [],
          failed: false
        });
      })
      .catch(() => {
        if (!active) return;
        setListResult({ key: `${classId}|${studentId}|${retryKey}`, rows: [], students: [], failed: true });
      });
    return () => { active = false; };
  }, [classId, studentId, retryKey]);

  const threadKey = activeId ? `${activeId}|${threadRetryKey}` : '';

  useEffect(() => {
    if (!activeId) return undefined;
    let active = true;
    tutorService.conversation(activeId)
      .then((response) => {
        if (active) setThreadResult({ key: `${activeId}|${threadRetryKey}`, data: unwrap(response) || null, failed: false });
      })
      .catch(() => {
        if (active) setThreadResult({ key: `${activeId}|${threadRetryKey}`, data: null, failed: true });
      });
    return () => { active = false; };
  }, [activeId, threadRetryKey]);

  const settled = listResult.key === listKey;

  return {
    classes,
    classId,
    setClassId: (value) => { setClassId(value); setStudentId(''); setActiveId(''); },
    studentId,
    setStudentId,
    rows: listResult.rows,
    students: listResult.students,
    loading: !settled,
    failed: settled && listResult.failed,
    retry: () => setRetryKey((current) => current + 1),
    activeId,
    setActiveId,
    thread: threadResult.key === threadKey ? threadResult.data : null,
    threadLoading: Boolean(activeId) && threadResult.key !== threadKey,
    threadFailed: threadResult.key === threadKey && threadResult.failed,
    retryThread: () => setThreadRetryKey((current) => current + 1)
  };
};
