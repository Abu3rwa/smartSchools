import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import i18n from '../../../../i18n/index.js';
import tutorService from '../../../../services/tutorService.js';

const unwrap = (response) => response?.data?.data;
const errorText = (error) => error?.response?.data?.message || '';
const walletOf = (row) => {
  if (!row) return null;
  if (row.wallet) return row.wallet;
  const wallet = { ...row };
  delete wallet.studentId;
  return wallet;
};

/**
 * Credit for one class at a time. The admin either gives the same amount to
 * everyone or ticks the students who need it; both paths add to the existing
 * balance, never replace it.
 */
export const useTutorCredits = ({ defaultCredits = 30 } = {}) => {
  const [classId, setClassId] = useState('');
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState('');
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!classId) {
      setStudents([]);
      setSelected([]);
      return undefined;
    }
    let active = true;
    setLoading(true);
    setSelected([]);
    tutorService.adminStudents({ classId })
      .then((response) => { if (active) setStudents(unwrap(response) || []); })
      .catch(() => { if (active) setStudents([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [classId]);

  const mergeWallets = (rows = []) => {
    const byId = new Map(rows.map((row) => [row.studentId, walletOf(row)]));
    setStudents((current) => current.map((student) => (
      byId.has(student.id) ? { ...student, wallet: byId.get(student.id) } : student
    )));
  };

  const readAmount = () => {
    const raw = String(amount).trim();
    const value = raw ? Number(raw) : Number(defaultCredits);
    if (!Number.isInteger(value) || value < 0 || value > 1000) {
      toast.error(i18n.t('tutor:admin.credits.amountInvalid'));
      return null;
    }
    return value;
  };

  const distribute = async () => {
    if (!classId || busy) return;
    const credits = readAmount();
    if (credits === null) return;
    setBusy(true);
    try {
      const data = unwrap(await tutorService.distributeCredits({ classId, credits }));
      mergeWallets(data?.credits || []);
      toast.success(i18n.t('tutor:admin.credits.classGiven', { n: credits, total: data?.students ?? 0 }));
    } catch (error) {
      toast.error(errorText(error) || i18n.t('tutor:admin.credits.giveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const giveSelected = async () => {
    if (!selected.length || busy) return;
    const credits = readAmount();
    if (credits === null) return;
    setBusy(true);
    try {
      const data = unwrap(await tutorService.giveCredits({ studentIds: selected, credits }));
      mergeWallets(data?.credits || []);
      setSelected([]);
      toast.success(i18n.t('tutor:admin.credits.given', { n: credits, total: data?.students ?? selected.length }));
    } catch (error) {
      toast.error(errorText(error) || i18n.t('tutor:admin.credits.giveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const togglePause = async (studentId, paused) => {
    if (busy) return;
    setBusy(true);
    try {
      const row = unwrap(await tutorService.pauseStudent(studentId, paused));
      mergeWallets([row]);
      toast.success(paused ? i18n.t('tutor:admin.credits.pausedToast') : i18n.t('tutor:admin.credits.resumedToast'));
    } catch (error) {
      toast.error(errorText(error) || i18n.t('tutor:admin.credits.giveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const toggleSelected = (studentId) => {
    setSelected((current) => (
      current.includes(studentId)
        ? current.filter((id) => id !== studentId)
        : [...current, studentId]
    ));
  };

  const toggleAll = () => {
    setSelected((current) => (current.length === students.length ? [] : students.map((row) => row.id)));
  };

  return {
    classId,
    setClassId,
    students,
    loading,
    amount,
    setAmount,
    selected,
    toggleSelected,
    toggleAll,
    busy,
    distribute,
    giveSelected,
    togglePause
  };
};
