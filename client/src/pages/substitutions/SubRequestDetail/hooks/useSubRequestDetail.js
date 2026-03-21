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
  selectRespondInPortal,
  fetchSubPendingCountThunk
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
  const [responseNotesByAssignment, setResponseNotesByAssignment] = useState({});
  const [teacherAction, setTeacherAction] = useState(null);

  const extractId = useCallback((value) => {
    if (!value) return null;
    if (typeof value === 'string' || typeof value === 'number') return value.toString();
    if (typeof value === 'object') {
      if (value._id) return value._id.toString();
      if (value.id) return value.id.toString();
      if (value.user?._id) return value.user._id.toString();
      if (value.user?.id) return value.user.id.toString();
    }
    return null;
  }, []);

  const currentUserId = extractId(user);

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
          const subId = extractId(assignment.substituteTeacherId);
          return !!subId && !!currentUserId && subId === currentUserId;
        })
      : [];
  }, [currentUserId, extractId, isTeacher, item?.assignments]);

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
    (() => {
      const absentId = extractId(item?.absentTeacherId);
      return !!absentId && !!currentUserId && absentId === currentUserId;
    })();

  const canCancel = item?.status === 'SUBMITTED' && (user?.role === 'admin' || user?.role === 'department_principal');

  const setResponseNoteForAssignment = useCallback((assignmentId, value) => {
    if (!assignmentId) return;
    setResponseNotesByAssignment((prev) => ({
      ...prev,
      [assignmentId]: value
    }));
  }, []);

  const handleTeacherRespond = useCallback((action, assignmentId, inlineNote) => {
    if (!id) return;
    const targetAssignment = assignmentId
      ? (displayAssignments || []).find((assignment) => assignment?._id?.toString() === assignmentId?.toString())
      : null;
    const noteValue = (inlineNote ?? teacherNote).trim();

    if (action === 'CONFIRM') {
      if (targetAssignment && (targetAssignment?.status || 'PENDING') !== 'PENDING') return;
      if (!targetAssignment && !hasPendingForTeacher) return;
    }

    if (action === 'DECLINE') {
      if (targetAssignment && (targetAssignment?.status || 'PENDING') !== 'PENDING') return;
      if (!targetAssignment && !hasPendingForTeacher) return;
    }

    if (action === 'WITHDRAW') {
      if (targetAssignment && targetAssignment?.status !== 'CONFIRMED') return;
      if (!targetAssignment && !hasConfirmedForTeacher) return;
    }

    if ((action === 'DECLINE' || action === 'WITHDRAW') && !noteValue) {
        toast.error('Please provide a reason (note) for this action.');
        return;
    }

    setTeacherAction(action);
    dispatch(
      respondToSubRequestAuthThunk({
        id,
        action,
        note: noteValue || undefined,
        assignmentId: targetAssignment?._id || assignmentId || undefined
      })
    )
      .unwrap()
      .then(() => {
        if (action === 'CONFIRM') {
          toast.success('Substitution confirmed');
        } else if (action === 'DECLINE') {
          toast.success('Substitution declined');
        } else {
          toast.success('Assignment withdrawn');
        }
        setTeacherNote('');
        if (assignmentId) {
          setResponseNotesByAssignment((prev) => ({
            ...prev,
            [assignmentId]: ''
          }));
        }
        dispatch(fetchSubPendingCountThunk());
      })
      .catch((err) => {
        toast.error(err || 'Failed to submit response');
      })
      .finally(() => {
        setTeacherAction(null);
      });
  }, [dispatch, displayAssignments, hasConfirmedForTeacher, hasPendingForTeacher, id, teacherNote]);

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
    responseNotesByAssignment,
    setResponseNoteForAssignment,
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
