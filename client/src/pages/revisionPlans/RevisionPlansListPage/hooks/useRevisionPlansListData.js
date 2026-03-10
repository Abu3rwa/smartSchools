import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import {
  fetchMyPlans,
  fetchTeacherPlans,
  selectRevisionPlans,
  selectRevisionLoading,
  selectRevisionError,
} from "../../../../store/slices/revisionSlice.js";
import { selectUser } from "../../../../store/slices/authSlice.js";
import { selectCurrentAcademicYear } from "../../../../store/slices/uiSlice.js";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";

/**
 * Data for Revision Plans List page. Student + Teacher shared.
 */
export function useRevisionPlansListData() {
  const { t } = useTranslation(["revisionPlans"]);
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const academicYear = useSelector(selectCurrentAcademicYear);
  const plans = useSelector(selectRevisionPlans);
  const loading = useSelector(selectRevisionLoading);
  const error = useSelector(selectRevisionError);

  const isTeacher = user?.role === "teacher" || user?.role === "admin";
  const isStudent = user?.role === "student";

  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    if (isStudent) {
      dispatch(fetchMyPlans(statusFilter || undefined));
    } else if (isTeacher) {
      dispatch(
        fetchTeacherPlans({
          status: statusFilter || undefined,
          academicYear,
        }),
      );
    }
  }, [dispatch, isStudent, isTeacher, statusFilter, academicYear]);

  useEffect(() => {
    if (error) toast.error(error || t("revisionPlans:toasts.loadFailed"));
  }, [error, t]);

  const handleCreate = () => navigate("/portal/revision/create");
  const handlePlanClick = (planId) => navigate(`/portal/revision/${planId}`);

  const list = Array.isArray(plans) ? plans : [];

  return {
    list,
    loading,
    isStudent,
    isTeacher,
    academicYear,
    statusFilter,
    setStatusFilter,
    handleCreate,
    handlePlanClick,
  };
}
