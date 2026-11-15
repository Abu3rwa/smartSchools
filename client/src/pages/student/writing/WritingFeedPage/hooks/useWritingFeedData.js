import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import writingService from "../../../../../services/writingService.js";

const EMPTY_FEED = { assignments: [], totals: {} };

export function useWritingFeedData() {
  const navigate = useNavigate();
  const { t } = useTranslation(["writing"]);
  const [feed, setFeed] = useState(EMPTY_FEED);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [opening, setOpening] = useState("");

  // A failed load is a failure, not an empty list: the page must say so and offer a retry.
  useEffect(() => {
    let active = true;
    setLoading(true);
    writingService.getMyWriting()
      .then((data) => {
        if (!active) return;
        setFeed(data || EMPTY_FEED);
        setFailed(false);
      })
      .catch(() => {
        if (!active) return;
        setFeed(EMPTY_FEED);
        setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [attempt]);

  // A task the student has not opened yet has no workspace row; opening it
  // creates that row and returns the project to edit.
  const openAssignment = useCallback(async (card) => {
    if (card.projectId) {
      navigate(`/portal/writing/project/${card.projectId}`);
      return;
    }
    setOpening(card.id);
    try {
      const project = await writingService.openProject(card.id);
      navigate(`/portal/writing/project/${project.project.id}`);
    } catch (error) {
      toast.error(error?.response?.data?.message || t("writing:student.loadFailed"));
    } finally {
      setOpening("");
    }
  }, [navigate, t]);

  return {
    assignments: feed.assignments || [],
    totals: feed.totals || {},
    loading,
    failed,
    retry: () => setAttempt((current) => current + 1),
    opening,
    openAssignment,
  };
}
