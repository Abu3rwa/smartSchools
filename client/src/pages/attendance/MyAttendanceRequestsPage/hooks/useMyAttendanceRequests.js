import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "../../../../config/api.js";
import toast from "react-hot-toast";

/**
 * Data and actions for My Attendance Requests page.
 * Fetches user's attendance requests.
 */
export function useMyAttendanceRequests() {
  const { t } = useTranslation(["myAttendanceRequests"]);
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/attendance-requests")
      .then((res) => {
        if (res.data.success) setRequests(res.data.data || []);
      })
      .catch(() => {
        toast.error(t("myAttendanceRequests:toast.loadFailed"));
        setRequests([]);
      })
      .finally(() => setLoading(false));
  }, [t]);

  const onNewRequest = () => navigate("/portal/attendance-request");

  return { requests, loading, onNewRequest };
}
