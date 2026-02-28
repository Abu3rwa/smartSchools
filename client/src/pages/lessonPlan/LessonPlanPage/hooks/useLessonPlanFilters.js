import { useState, useMemo, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { selectClasses } from '../../../../store/slices/classSlice.js';
import { selectSubjects } from '../../../../store/slices/subjectSlice.js';
import { selectTeachers } from '../../../../store/slices/teacherSlice.js';

/**
 * Filter state and derived class/subject lists (teacher-scoped when teacher selected).
 */
export default function useLessonPlanFilters(canFilterAsAdmin) {
  const classes = useSelector(selectClasses);
  const subjects = useSelector(selectSubjects);
  const teachers = useSelector(selectTeachers);

  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState('');
  const [selectedClassFilter, setSelectedClassFilter] = useState('');
  const [selectedTeacherFilter, setSelectedTeacherFilter] = useState('');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');

  const selectedTeacher = selectedTeacherFilter
    ? teachers.find(
        (t) => (t.user?._id || t.user)?.toString() === selectedTeacherFilter
      )
    : null;

  const filterClasses = useMemo(() => {
    if (!canFilterAsAdmin) return [];
    if (!selectedTeacher?.assignedClasses?.length) return classes;
    const seen = new Set();
    const result = [];
    for (const ac of selectedTeacher.assignedClasses) {
      const c = ac.class;
      const cid = c?._id?.toString() || c?.toString();
      if (cid && !seen.has(cid)) {
        seen.add(cid);
        const name =
          c?.name ??
          classes.find((cl) => (cl._id || cl).toString() === cid)?.name ??
          cid;
        result.push({ _id: cid, name });
      }
    }
    return result.length ? result : classes;
  }, [canFilterAsAdmin, selectedTeacher, classes]);

  const filterSubjects = useMemo(() => {
    if (!canFilterAsAdmin) return [];
    if (!selectedTeacher?.assignedClasses?.length) return subjects;
    const seen = new Set();
    const result = [];
    for (const ac of selectedTeacher.assignedClasses) {
      const s = ac.subject;
      const sid = s?._id?.toString() || s?.toString();
      if (sid && !seen.has(sid)) {
        seen.add(sid);
        const name =
          s?.name ??
          subjects.find((su) => (su._id || su).toString() === sid)?.name ??
          sid;
        result.push({ _id: sid, name });
      }
    }
    return result.length ? result : subjects;
  }, [canFilterAsAdmin, selectedTeacher, subjects]);

  useEffect(() => {
    if (!canFilterAsAdmin || !selectedTeacherFilter) return;
    const classIds = new Set(filterClasses.map((c) => (c._id || c).toString()));
    const subjectIds = new Set(
      filterSubjects.map((s) => (s._id || s).toString())
    );
    setSelectedClassFilter((prev) => (prev && !classIds.has(prev) ? '' : prev));
    setSelectedSubjectFilter((prev) =>
      prev && !subjectIds.has(prev) ? '' : prev
    );
  }, [canFilterAsAdmin, selectedTeacherFilter, filterClasses, filterSubjects]);

  const setTeacherAndClearRest = (teacherId) => {
    setSelectedTeacherFilter(teacherId);
    setSelectedClassFilter('');
    setSelectedSubjectFilter('');
  };

  return {
    selectedSubjectFilter,
    setSelectedSubjectFilter,
    selectedClassFilter,
    setSelectedClassFilter,
    selectedTeacherFilter,
    setSelectedTeacherFilter: setTeacherAndClearRest,
    startDateFilter,
    setStartDateFilter,
    endDateFilter,
    setEndDateFilter,
    teachers,
    filterClasses,
    filterSubjects,
    classes,
    subjects,
  };
}
