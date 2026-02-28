import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { selectUser } from '../../../../store/slices/authSlice';
import {
  fetchSubRequestByIdThunk,
  cancelSubRequestThunk,
  selectDetail,
  respondToSubRequestAuthThunk,
  selectRespondInPortal
} from '../../../../store/slices/substitutionsSlice';

const useSubRequestDetail = () => {
  const { id } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const user = useSelector(selectUser);
  const { loading, error, item } = useSelector(selectDetail);
  const respondInPortal = useSelector(selectRespondInPortal);

  const [cancelModal, setCancelModal] = useState(false);
  const [cancelNote, setCancelNote] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [teacherNote, setTeacherNote] = useState('');
  const [teacherAction, setTeacherAction] = useState(null);

  useEffect(() => {
    if (id) dispatch(fetchSubRequestByIdThunk(id));
  }, [id, dispatch]);

  const handleCancel = useCallback(() => {
    if (!id) return;
    setCancelling(true);
    dispatch(cancelSubRequestThunk({ id, note: cancelNote }))
      .then((result) => {
        if (cancelSubRequestThunk.fulfilled.match(result)) {
          toast.success('Request cancelled');
          setCancelModal(false);
          setCancelNote('');
        } else {
          toast.error(result.payload || 'Failed to cancel');
        }
      })
      .finally(() => setCancelling(false));
  }, [cancelNote, dispatch, id]);

  const isTeacher = user?.role === 'teacher';

  const displayAssignments = useMemo(() => {
    if (!isTeacher) return item?.assignments;
    return item?.assignments
      ? item.assignments.filter((assignment) => {
          const subId = assignment.substituteTeacherId?._id || assignment.substituteTeacherId;
          return subId?.toString() === user?._id?.toString();
        })
      : item?.assignments;
  }, [isTeacher, item?.assignments, user?._id]);

  const assignmentCounts = useMemo(() => {
    return (displayAssignments || []).reduce(
      (acc, assignment) => {
        const status = assignment?.status || 'PENDING';
        if (status === 'CONFIRMED') acc.confirmed += 1;
        else if (status === 'DECLINED') acc.declined += 1;
        else acc.pending += 1;
        return acc;
      },
      { pending: 0, confirmed: 0, declined: 0 }
    );
  }, [displayAssignments]);

  const hasConfirmedForTeacher = isTeacher && (displayAssignments || []).some((assignment) => assignment?.status === 'CONFIRMED');
  const hasPendingForTeacher = isTeacher && (displayAssignments || []).some((assignment) => (assignment?.status || 'PENDING') === 'PENDING');
  const hasDeclinedForTeacher = isTeacher && (displayAssignments || []).some((assignment) => assignment?.status === 'DECLINED');

  const isAbsentTeacher = isTeacher &&
    (item?.absentTeacherId?._id?.toString() === user?._id?.toString() ||
      item?.absentTeacherId?.toString() === user?._id?.toString());

  const canCancel = item?.status === 'SUBMITTED' && (user?.role === 'admin' || user?.role === 'department_principal');

  const handleTeacherRespond = useCallback((action) => {
    if (!id) return;
    if (action === 'CONFIRM' && !hasPendingForTeacher) return;
    if (action === 'DECLINE' && !hasPendingForTeacher) return;
    if (action === 'WITHDRAW' && !hasConfirmedForTeacher) return;
    if ((action === 'DECLINE' || action === 'WITHDRAW') && !teacherNote.trim()) return;
    setTeacherAction(action);
    dispatch(
      respondToSubRequestAuthThunk({
        id,
        action,
        note: teacherNote.trim() || undefined
      })
    )
      .unwrap()
      .then(() => {
        toast.success(action === 'CONFIRM' ? 'Substitution confirmed' : 'Substitution declined');
      })
      .catch((err) => {
        toast.error(err || 'Failed to submit response');
      })
      .finally(() => {
        setTeacherAction(null);
      });
  }, [dispatch, hasConfirmedForTeacher, hasPendingForTeacher, id, teacherNote]);

  return {
    id,
    loading,
    error,
    item,
    user,
    respondInPortal,
    cancelModal,
    setCancelModal,
    cancelNote,
    setCancelNote,
    cancelling,
    teacherNote,
    setTeacherNote,
    teacherAction,
    handleCancel,
    handleTeacherRespond,
    displayAssignments,
    assignmentCounts,
    hasConfirmedForTeacher,
    hasPendingForTeacher,
    hasDeclinedForTeacher,
    isAbsentTeacher,
    isTeacher,
    canCancel,
    navigate
  };
};

export default useSubRequestDetail;