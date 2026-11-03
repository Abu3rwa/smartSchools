import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import i18n from '../../../../i18n/index.js';
import tutorService from '../../../../services/tutorService.js';

const unwrap = (response) => response?.data?.data;
const errorText = (error) => error?.response?.data?.message || '';
const errorCode = (error) => error?.response?.data?.code || '';
const walletOf = (row) => {
  if (!row) return null;
  if (row.wallet) return row.wallet;
  const wallet = { ...row };
  delete wallet.studentId;
  return wallet;
};

const amountOf = (raw, fallback) => {
  const text = String(raw).trim();
  const value = text ? Number(text) : Number(fallback);
  if (!Number.isInteger(value) || value < 0 || value > 1000) return null;
  return value;
};

/**
 * Credit for one class at a time. The admin either gives the same amount to
 * everyone or ticks the students who need it; both paths add to the existing
 * balance, never replace it.
 *
 * Question credit and voice credit differ in where they come from: questions are
 * the tutor's own wallet, voice money leaves the school reserve. So the panel
 * shows the reserve and the cost of the grant before anything is sent.
 */
export const useTutorCredits = ({ defaultCredits = 30, initialReserve = 0 } = {}) => {
  const [classId, setClassId] = useState('');
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState('');
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  // Voice credit is money from the school reserve; questions are the tutor's own
  // wallet. Both add to a balance, so one panel serves both with a switch.
  const [kind, setKind] = useState('questions');
  const [reserve, setReserve] = useState(initialReserve);
  // '' | 'short' (nothing moved) | 'partial' (the reserve ran out mid-list)
  const [reserveNotice, setReserveNotice] = useState('');
  // Take back uses the same amount field; this switches it to "everything".
  const [takeAll, setTakeAll] = useState(false);
  const [history, setHistory] = useState(null);

  useEffect(() => {
    setReserve(initialReserve);
  }, [initialReserve]);

  useEffect(() => {
    if (!classId) {
      setStudents([]);
      setSelected([]);
      return undefined;
    }
    let active = true;
    setLoading(true);
    setSelected([]);
    setReserveNotice('');
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
    const value = amountOf(amount, defaultCredits);
    if (value === null) {
      toast.error(i18n.t('tutor:admin.credits.amountInvalid'));
      return null;
    }
    if (kind === 'voice' && value < 1) {
      toast.error(i18n.t('tutor:admin.credits.voiceAmountInvalid'));
      return null;
    }
    return value;
  };

  const mergeVoice = (rows = [], { reclaimableDelta = 0 } = {}) => {
    const byId = new Map(rows.map((row) => [row.studentId, row.voiceCredits]));
    const reclaimableById = new Map(
      rows
        .filter((row) => row.reclaimableCredits !== undefined)
        .map((row) => [row.studentId, row.reclaimableCredits])
    );
    setStudents((current) => current.map((student) => {
      if (!byId.has(student.id)) return student;
      const next = { ...student, voiceCredits: byId.get(student.id) };
      if (reclaimableById.has(student.id)) {
        next.voiceReclaimableCredits = reclaimableById.get(student.id);
      } else if (reclaimableDelta) {
        next.voiceReclaimableCredits = Math.max(0, (student.voiceReclaimableCredits ?? 0) + reclaimableDelta);
      }
      return next;
    }));
  };

  const give = async ({ studentIds = null, broadcast = false } = {}) => {
    if (busy) return;
    const credits = readAmount();
    if (credits === null) return;
    const targets = broadcast ? students.length : (studentIds || []).length;
    setReserveNotice('');
    if (kind === 'voice' && credits * targets > reserve) {
      setReserveNotice('short');
      return;
    }
    setBusy(true);
    try {
      if (kind === 'voice') {
        const data = unwrap(await tutorService.giveVoiceCredits(
          broadcast ? { classId, credits } : { studentIds, credits }
        ));
        const rows = data?.rows || [];
        mergeVoice(rows, { reclaimableDelta: credits });
        setSelected([]);
        setReserve((current) => Math.max(0, current - credits * rows.length));
        if (data?.shortPool) {
          setReserveNotice('partial');
        } else {
          toast.success(i18n.t('tutor:admin.credits.voiceGiven', {
            n: credits,
            total: data?.students ?? students.length
          }));
        }
        return;
      }
      if (broadcast) {
        const data = unwrap(await tutorService.distributeCredits({ classId, credits }));
        mergeWallets(data?.credits || []);
        toast.success(i18n.t('tutor:admin.credits.classGiven', { n: credits, total: data?.students ?? 0 }));
        return;
      }
      const data = unwrap(await tutorService.giveCredits({ studentIds, credits }));
      mergeWallets(data?.credits || []);
      setSelected([]);
      toast.success(i18n.t('tutor:admin.credits.given', { n: credits, total: data?.students ?? studentIds.length }));
    } catch (error) {
      if (kind === 'voice' && errorCode(error) === 'AI_CREDIT_RESERVE_SHORT') {
        setReserveNotice('short');
      } else {
        toast.error(errorText(error) || i18n.t('tutor:admin.credits.giveFailed'));
      }
    } finally {
      setBusy(false);
    }
  };

  const distribute = () => give({ broadcast: true });
  const giveSelected = () => {
    if (!selected.length) return;
    return give({ studentIds: selected });
  };

  const readTakeAmount = () => {
    if (takeAll) return null;
    const value = amountOf(amount, defaultCredits);
    if (value === null || value < 1) {
      toast.error(i18n.t('tutor:admin.credits.takeAmountInvalid'));
      return undefined;
    }
    return value;
  };

  const takeBack = async ({ broadcast = false, studentIds = null, student = null } = {}) => {
    if (busy) return;
    const credits = readTakeAmount();
    if (credits === undefined) return;
    const targets = broadcast ? students.length : (student ? 1 : (studentIds || []).length);
    if (!targets) return;

    const amountLabel = takeAll
      ? i18n.t('tutor:admin.credits.takeAllAmount')
      : String(credits);
    const confirmText = kind === 'voice'
      ? i18n.t('tutor:admin.credits.takeConfirmVoice', { amount: amountLabel, students: targets })
      : i18n.t('tutor:admin.credits.takeConfirmQuestions', { amount: amountLabel, students: targets });
    if (typeof window !== 'undefined' && !window.confirm(confirmText)) return;

    const body = { kind, all: takeAll };
    if (credits !== null) body.credits = credits;
    if (broadcast) body.classId = classId;
    else if (student) body.studentIds = [student.id];
    else body.studentIds = studentIds;

    setBusy(true);
    setReserveNotice('');
    try {
      const data = unwrap(await tutorService.takeBackCredits(body));
      if (kind === 'voice') {
        const rows = data?.rows || [];
        mergeVoice(rows);
        if (typeof data?.reserveCredits === 'number') setReserve(data.reserveCredits);
        const total = Number(data?.takenTotal) || 0;
        if (total > 0) {
          toast.success(i18n.t('tutor:admin.credits.voiceTaken', {
            total,
            n: data?.students ?? rows.length
          }));
        } else {
          toast(i18n.t('tutor:admin.credits.nothingToTake'));
        }
      } else {
        const rows = data?.credits || [];
        mergeWallets(rows);
        const total = rows.reduce((sum, row) => sum + (Number(row.taken) || 0), 0);
        if (total > 0) {
          toast.success(i18n.t('tutor:admin.credits.taken', { total, n: rows.length }));
        } else {
          toast(i18n.t('tutor:admin.credits.nothingToTake'));
        }
      }
      setSelected([]);
    } catch (error) {
      toast.error(errorText(error) || i18n.t('tutor:admin.credits.takeFailed'));
    } finally {
      setBusy(false);
    }
  };

  const takeFromClass = () => takeBack({ broadcast: true });
  const takeFromSelected = () => {
    if (!selected.length) return;
    return takeBack({ studentIds: selected });
  };
  const takeFromStudent = (student) => takeBack({ student });

  const openHistory = async (student) => {
    setHistory({ student, loading: true, data: null });
    try {
      const data = unwrap(await tutorService.creditHistory(student.id));
      setHistory({ student, loading: false, data });
    } catch (error) {
      setHistory(null);
      toast.error(errorText(error) || i18n.t('tutor:admin.credits.historyFailed'));
    }
  };
  const closeHistory = () => setHistory(null);

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

  const setLevel = async (studentId, level) => {
    if (busy) return;
    setBusy(true);
    try {
      const row = unwrap(await tutorService.setStudentLevel(studentId, level));
      setStudents((current) => current.map((student) => (
        student.id === studentId ? { ...student, languageLevel: row?.languageLevel ?? null } : student
      )));
      toast.success(i18n.t('tutor:admin.credits.levelSaved'));
    } catch (error) {
      toast.error(errorText(error) || i18n.t('tutor:admin.credits.giveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const toggleSelected = (studentId) => {
    setReserveNotice('');
    setSelected((current) => (
      current.includes(studentId)
        ? current.filter((id) => id !== studentId)
        : [...current, studentId]
    ));
  };

  const toggleAll = () => {
    setReserveNotice('');
    setSelected((current) => (current.length === students.length ? [] : students.map((row) => row.id)));
  };

  const changeKind = (next) => {
    setKind(next);
    setReserveNotice('');
  };

  const changeTakeAll = (next) => {
    setTakeAll(next);
    setReserveNotice('');
  };

  const changeAmount = (value) => {
    setAmount(value);
    setReserveNotice('');
  };

  const amountValue = amountOf(amount, defaultCredits);
  const isVoice = kind === 'voice';
  const classCost = amountValue === null ? null : amountValue * students.length;
  const selectedCost = amountValue === null ? null : amountValue * selected.length;
  const classShort = isVoice && classCost !== null && classCost > reserve;
  const selectedShort = isVoice && selected.length > 0 && selectedCost !== null && selectedCost > reserve;

  return {
    classId,
    setClassId,
    students,
    loading,
    amount,
    setAmount: changeAmount,
    kind,
    setKind: changeKind,
    selected,
    toggleSelected,
    toggleAll,
    busy,
    distribute,
    giveSelected,
    takeAll,
    setTakeAll: changeTakeAll,
    takeFromClass,
    takeFromSelected,
    takeFromStudent,
    history,
    openHistory,
    closeHistory,
    togglePause,
    setLevel,
    reserve,
    reserveNotice,
    amountValue,
    classCost,
    selectedCost,
    classShort,
    selectedShort
  };
};
