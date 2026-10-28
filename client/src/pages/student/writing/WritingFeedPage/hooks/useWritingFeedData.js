import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import writingService from "../../../../../services/writingService.js";

const EMPTY_FEED = { assignments: [], totals: {} };

export function useWritingFeedData() {
  const navigate = useNavigate();
  const [feed, setFeed] = useState(EMPTY_FEED);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState("");

  useEffect(() => {
    let active = true;
    writingService.getMyWriting()
      .then((data) => {
        if (active) setFeed(data || EMPTY_FEED);
      })
      .catch((error) => {
        if (active) toast.error(error?.response?.data?.message || "Could not load your writing tasks.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

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
      toast.error(error?.response?.data?.message || "This writing task could not be opened.");
    } finally {
      setOpening("");
    }
  }, [navigate]);

  return {
    assignments: feed.assignments || [],
    totals: feed.totals || {},
    loading,
    opening,
    openAssignment,
  };
}
