import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import {
  fetchPlan,
  updatePlanProgress,
  selectCurrentPlan,
  selectRevisionLoading,
  selectRevisionError,
  clearCurrentPlan,
} from "../../../../store/slices/revisionSlice.js";
import { selectUser } from "../../../../store/slices/authSlice.js";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";

/**
 * Data for Revision Plan View page. Student + Teacher shared.
 */
export function useRevisionPlanViewData() {
  const { t } = useTranslation(["revisionPlans"]);
  const { planId } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const plan = useSelector(selectCurrentPlan);
  const loading = useSelector(selectRevisionLoading);
  const error = useSelector(selectRevisionError);
  const user = useSelector(selectUser);

  const [updating, setUpdating] = useState(false);
  const isStudent = user?.role === "student";

  useEffect(() => {
    if (planId) dispatch(fetchPlan(planId));
    return () => dispatch(clearCurrentPlan());
  }, [dispatch, planId]);

  useEffect(() => {
    if (error) toast.error(error || t("revisionPlans:toasts.loadFailed"));
  }, [error, t]);

  const handleTopicComplete = async (topicIndex, completed) => {
    if (!planId || !isStudent) return;
    setUpdating(true);
    try {
      await dispatch(
        updatePlanProgress({
          planId,
          body: { topicIndex, completed },
        }),
      ).unwrap();
      toast.success(completed ? t("revisionPlans:toasts.topicComplete") : t("revisionPlans:toasts.topicUnchecked"));
    } catch (e) {
      toast.error(e || t("revisionPlans:toasts.updateFailed"));
    }
    setUpdating(false);
  };

  const completedTopics =
    plan?.topics?.filter((t) => t.completed).length ?? 0;
  const totalTopics = plan?.topics?.length ?? 0;
  const progressPct = totalTopics
    ? Math.round((completedTopics / totalTopics) * 100)
    : 0;

  return {
    plan,
    planId,
    loading,
    isStudent,
    updating,
    completedTopics,
    totalTopics,
    progressPct,
    handleTopicComplete,
    onBack: () => navigate("/portal/revision"),
  };
}
