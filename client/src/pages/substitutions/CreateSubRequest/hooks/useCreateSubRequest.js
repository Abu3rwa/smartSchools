import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  selectTeachers,
  selectTeachersLoading
} from '../../../../store/slices/teacherSlice';
import {
  fetchSubCandidates,
  createSubRequestThunk,
  selectCandidates,
  selectCreate,
  clearCreateState
} from '../../../../store/slices/substitutionsSlice';
import { COVERAGE_TYPES, DEFAULT_COVERAGE_TYPE } from '../constants';
import { buildTeacherOptions, getTomorrowDate, isPastDate } from '../utils/createSubRequestUtils';

const useCreateSubRequest = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const teachers = useSelector(selectTeachers);
  const teachersLoading = useSelector(selectTeachersLoading);
  const { loading: candidatesLoading, error: candidatesError, data: candidatesData } = useSelector(selectCandidates);
  const { loading: createLoading, error: createError, success, requestId } = useSelector(selectCreate);

  const [absentTeacherId, setAbsentTeacherId] = useState('');
  const [date, setDate] = useState(getTomorrowDate());
  const [coverageType, setCoverageType] = useState(DEFAULT_COVERAGE_TYPE);
  const [singleSubstituteId, setSingleSubstituteId] = useState('');
  const [perPeriodSelections, setPerPeriodSelections] = useState({});
  const [principalNote, setPrincipalNote] = useState('');
  const [materialsLink, setMaterialsLink] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (success && requestId) {
      toast.success('Substitution request created successfully.');
      dispatch(clearCreateState());
      navigate(`/portal/substitutions/${requestId}`);
    }
  }, [success, requestId, dispatch, navigate]);

  const teacherOptions = useMemo(() => buildTeacherOptions(teachers), [teachers]);

  const candidatesAll = candidatesData?.candidatesAllPeriods || [];
  const candidatesByPeriod = candidatesData?.candidatesByPeriod || {};
  const targetPeriods = candidatesData?.targetPeriods || [];
  const periodIds = targetPeriods.map((p) => p.periodId?._id || p.periodId);

  const handleLoadCandidates = useCallback(() => {
    if (!absentTeacherId || !date) {
      toast.error('Please select absent teacher and date.');
      return;
    }
    if (isPastDate(date)) {
      toast.error('Date cannot be in the past.');
      return;
    }
    setLoaded(false);
    dispatch(fetchSubCandidates({ absentTeacherId, date })).then((result) => {
      if (result.meta.requestStatus === 'fulfilled') setLoaded(true);
    });
  }, [absentTeacherId, date, dispatch]);

  const handleSubmit = useCallback(() => {
    if (!absentTeacherId || !date) {
      toast.error('Absent teacher and date are required.');
      return;
    }
    if (isPastDate(date)) {
      toast.error('Date cannot be in the past.');
      return;
    }
    if (!targetPeriods.length) {
      toast.error('Load affected periods first.');
      return;
    }

    if (coverageType === COVERAGE_TYPES.SINGLE) {
      if (!singleSubstituteId) {
        toast.error('Please select a substitute teacher.');
        return;
      }
      dispatch(
        createSubRequestThunk({
          absentTeacherId,
          date,
          coverageType,
          periods: periodIds,
          selections: { substituteTeacherId: singleSubstituteId },
          principalNote: principalNote.trim() || undefined,
          materialsLink: materialsLink.trim() || undefined
        })
      );
      return;
    }

    const missing = periodIds.filter((pid) => !perPeriodSelections[String(pid)]);
    if (missing.length > 0) {
      toast.error('Each period must have a substitute selected.');
      return;
    }
    dispatch(
      createSubRequestThunk({
        absentTeacherId,
        date,
        coverageType,
        periods: periodIds,
        selections: {
          perPeriod: periodIds.map((periodId) => ({
            periodId,
            substituteTeacherId: perPeriodSelections[String(periodId)]
          }))
        },
        principalNote: principalNote.trim() || undefined,
        materialsLink: materialsLink.trim() || undefined
      })
    );
  }, [absentTeacherId, coverageType, date, dispatch, materialsLink, perPeriodSelections, periodIds, principalNote, singleSubstituteId, targetPeriods.length]);

  const handleSelectPerPeriod = useCallback((periodId, substituteId) => {
    setPerPeriodSelections((prev) => ({
      ...prev,
      [String(periodId)]: substituteId || ''
    }));
  }, []);

  const canSubmit =
    loaded &&
    targetPeriods.length > 0 &&
    (coverageType === COVERAGE_TYPES.SINGLE
      ? Boolean(singleSubstituteId)
      : periodIds.length > 0 && periodIds.every((pid) => perPeriodSelections[String(pid)]));

  return {
    teacherOptions,
    teachersLoading,
    absentTeacherId,
    setAbsentTeacherId,
    date,
    setDate,
    coverageType,
    setCoverageType,
    singleSubstituteId,
    setSingleSubstituteId,
    perPeriodSelections,
    handleSelectPerPeriod,
    principalNote,
    setPrincipalNote,
    materialsLink,
    setMaterialsLink,
    loaded,
    candidatesLoading,
    candidatesError,
    candidatesAll,
    candidatesByPeriod,
    targetPeriods,
    periodIds,
    createLoading,
    createError,
    canSubmit,
    handleLoadCandidates,
    handleSubmit
  };
};

export default useCreateSubRequest;