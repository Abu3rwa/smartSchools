import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchTexts,
  fetchTeacherAssignments,
  createAssignment,
  selectReadingTexts,
  selectReadingAssignments,
  selectReadingLoading,
  selectReadingError,
} from "../../../../../store/slices/readingSlice.js";
import { selectClasses } from "../../../../../store/slices/classSlice.js";
import { selectCurrentAcademicYear } from "../../../../../store/slices/uiSlice.js";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";

export function useReadingTextsListData() {
  const { t } = useTranslation(["reading"]);
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const texts = useSelector(selectReadingTexts) || [];
  const assignments = useSelector(selectReadingAssignments) || [];
  const classes = useSelector(selectClasses) || [];
  const academicYear = useSelector(selectCurrentAcademicYear);
  const loading = useSelector(selectReadingLoading);
  const error = useSelector(selectReadingError);

  const [assignModal, setAssignModal] = useState(null);
  const [assignClassId, setAssignClassId] = useState("");
  const [assignDueDate, setAssignDueDate] = useState("");
  const [assignInstructions, setAssignInstructions] = useState("");
  const [assignSubmitting, setAssignSubmitting] = useState(false);

  useEffect(() => {
    dispatch(fetchTexts());
    dispatch(fetchTeacherAssignments({ academicYear }));
  }, [dispatch, academicYear]);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  const openAssignModal = (text) => {
    setAssignModal(text);
    setAssignClassId("");
    setAssignDueDate("");
    setAssignInstructions("");
  };

  const handleAssignSubmit = (e) => {
    e.preventDefault();
    if (!assignModal || !assignClassId) {
      toast.error(t("reading:texts.toasts.selectClass"));
      return;
    }
    setAssignSubmitting(true);
    dispatch(
      createAssignment({
        textId: assignModal._id,
        classId: assignClassId,
        dueDate: assignDueDate || undefined,
        instructions: assignInstructions.trim() || undefined,
      }),
    )
      .then((result) => {
        if (result.type === "reading/createAssignment/fulfilled") {
          toast.success(t("reading:texts.toasts.assignmentCreated"));
          setAssignModal(null);
          dispatch(fetchTeacherAssignments());
        } else if (result.type === "reading/createAssignment/rejected") {
          toast.error(result.payload || t("reading:texts.toasts.assignmentCreateFailed"));
        }
      })
      .finally(() => setAssignSubmitting(false));
  };

  const assignmentCountByText = (textId) =>
    assignments.filter((a) => a.text?._id === textId).length;

  return {
    texts,
    classes,
    academicYear,
    loading,
    assignModal,
    setAssignModal,
    assignClassId,
    setAssignClassId,
    assignDueDate,
    setAssignDueDate,
    assignInstructions,
    setAssignInstructions,
    assignSubmitting,
    openAssignModal,
    handleAssignSubmit,
    assignmentCountByText,
    onBack: () => navigate("/portal/dashboard"),
    onUpload: () => navigate("/portal/reading/upload"),
  };
}
