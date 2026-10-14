import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useLocation } from "react-router-dom";
import { selectUser } from "../store/slices/authSlice";
import {
  selectSchoolFeaturesError,
  selectSchoolFeaturesLoading,
  selectSchoolPageAccess,
  selectSchoolPageAccessError,
  fetchSchoolPageAccess,
} from "../store/slices/schoolFeaturesSlice";
import { getSchoolPageKeyForPath, SCHOOL_PAGE_ACCESS_PAGES } from "../constants/schoolPageAccess";

const SchoolPageAccessGate = ({ children }) => {
  const location = useLocation();
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const pageAccess = useSelector(selectSchoolPageAccess);
  const loading = useSelector(selectSchoolFeaturesLoading);
  const featuresError = useSelector(selectSchoolFeaturesError);
  const pageAccessError = useSelector(selectSchoolPageAccessError);
  const error = pageAccessError || featuresError;
  const pageKey = getSchoolPageKeyForPath(location.pathname);
  const [serverDeniedPageKey, setServerDeniedPageKey] = useState(null);

  useEffect(() => {
    if (!["teacher", "student"].includes(user?.role)) return undefined;
    dispatch(fetchSchoolPageAccess());
    const intervalId = window.setInterval(() => dispatch(fetchSchoolPageAccess()), 30000);
    return () => window.clearInterval(intervalId);
  }, [dispatch, user?.role]);

  useEffect(() => {
    const handlePageLocked = (event) => {
      if (event.detail?.page === pageKey) {
        setServerDeniedPageKey(pageKey);
      }
    };
    window.addEventListener("school-page-locked", handlePageLocked);
    return () => window.removeEventListener("school-page-locked", handlePageLocked);
  }, [pageKey]);

  if (!pageKey || !["teacher", "student"].includes(user?.role)) return children;

  if (!pageAccess || pageAccessError) {
    return (
      <section className="card" role="status" style={{ margin: "2rem auto", maxWidth: 680, padding: "2rem", textAlign: "center" }}>
        <h2>{error ? "Could not verify page availability" : "Loading access settings…"}</h2>
        <p>{error || (loading ? "Checking your school’s access settings." : "Please refresh to try again.")}</p>
        {error && <button type="button" className="btn btn-secondary" onClick={() => window.location.reload()}>Reload</button>}
      </section>
    );
  }

  if (pageAccess[user.role]?.[pageKey] !== false && serverDeniedPageKey !== pageKey) return children;

  const page = SCHOOL_PAGE_ACCESS_PAGES.find((item) => item.key === pageKey);
  return (
    <section className="card" role="status" style={{ margin: "2rem auto", maxWidth: 680, padding: "2rem", textAlign: "center" }}>
      <h2>{page?.label || "Page"} temporarily unavailable</h2>
      <p>Your school administrator has temporarily locked this page. Please contact them if you need access.</p>
    </section>
  );
};

export default SchoolPageAccessGate;
