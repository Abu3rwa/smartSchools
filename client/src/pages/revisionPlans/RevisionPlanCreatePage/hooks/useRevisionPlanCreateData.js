import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import {
  generatePlan,
  selectRevisionGenerating,
  selectRevisionError,
  selectCurrentPlan,
  clearCurrentPlan,
} from "../../../../store/slices/revisionSlice.js";
import { selectUser } from "../../../../store/slices/authSlice.js";
import { fetchSubjects } from "../../../../store/slices/subjectSlice.js";
import { fetchStudents } from "../../../../store/slices/studentSlice.js";
import { selectSubjects } from "../../../../store/slices/subjectSlice.js";
import { selectStudents } from "../../../../store/slices/studentSlice.js";
import { selectCurrentAcademicYear } from "../../../../store/slices/uiSlice.js";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";

export function useRevisionPlanCreateData() {
  const { t } = useTranslation(["revisionPlans"]);
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const academicYear = useSelector(selectCurrentAcademicYear);
  const subjects = useSelector(selectSubjects) || [];
  const students = useSelector(selectStudents) || [];
  const generating = useSelector(selectRevisionGenerating);
  const error = useSelector(selectRevisionError);
  const currentPlan = useSelector(selectCurrentPlan);
  const isTeacher = user?.role === "teacher" || user?.role === "admin";

  const [subjectId, setSubjectId] = useState("");
  const [examDate, setExamDate] = useState("");
  const [examLabel, setExamLabel] = useState("");
  const [studentId, setStudentId] = useState("");

  useEffect(() => {
    dispatch(clearCurrentPlan());
    dispatch(fetchSubjects());
    if (isTeacher) dispatch(fetchStudents());
  }, [dispatch, isTeacher]);

  useEffect(() => {
    if (error) toast.error(error || t("revisionPlans:toasts.createFailed"));
  }, [error, t]);

  useEffect(() => {
    if (currentPlan?._id) navigate(`/portal/revision/${currentPlan._id}`);
  }, [currentPlan, navigate]);

  const minDate = new Date();
  minDate.setDate(minDate.getDate() + 1);
  const minDateStr = minDate.toISOString().split("T")[0];

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!subjectId || !examDate) {
      toast.error(t("revisionPlans:toasts.subjectExamRequired"));
      return;
    }
    if (isTeacher && !studentId) {
      toast.error(t("revisionPlans:toasts.selectStudent"));
      return;
    }
    dispatch(
      generatePlan({
        subjectId,
        examDate: new Date(examDate).toISOString(),
        examLabel: examLabel || undefined,
        ...(isTeacher && { studentId }),
      }),
    );
  };

  return {
    isTeacher,
    academicYear,
    subjects,
    students,
    subjectId,
    setSubjectId,
    examDate,
    setExamDate,
    examLabel,
    setExamLabel,
    studentId,
    setStudentId,
    generating,
    minDateStr,
    handleSubmit,
    onBack: () => navigate("/portal/revision"),
  };
}
