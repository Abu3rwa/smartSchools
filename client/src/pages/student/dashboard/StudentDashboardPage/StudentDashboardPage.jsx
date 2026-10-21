import { useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import StudentDashboardHeader from "./components/StudentDashboardHeader";
import { selectSchoolFeatures } from "../../../../store/slices/schoolFeaturesSlice";
import { selectUser } from "../../../../store/slices/authSlice";
import { studentNavLinks } from "./utils/studentNavLinks";
import "./StudentDashboardPage.css";

const StudentDashboardPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation(["layout.sidebar"]);
  const schoolFeatures = useSelector(selectSchoolFeatures);
  const user = useSelector(selectUser);
  const firstName = user?.firstName ?? "Student";

  const availableNavLinks = useMemo(
    () =>
      studentNavLinks.filter((item) => {
        if (
          item.liveLessons &&
          import.meta.env.VITE_LIVE_LESSONS_ENABLED !== "true"
        ) {
          return false;
        }
        if (!item.feature) return true;
        return schoolFeatures?.[item.feature] !== false;
      }),
    [schoolFeatures],
  );

  return (
    <div className="student-dashboard">
      <StudentDashboardHeader firstName={firstName} />

      <section
        className="student-dashboard-nav"
        aria-label="Student navigation"
      >
        {availableNavLinks.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              type="button"
              className={`student-dashboard-nav-btn${location.pathname === item.path ? " active" : ""}`}
              onClick={() => navigate(item.path)}
              aria-current={
                location.pathname === item.path ? "page" : undefined
              }
            >
              <Icon size={26} className="student-dashboard-nav-icon" />
              <span>{t(`layout.sidebar:items.${item.labelKey}`)}</span>
            </button>
          );
        })}
      </section>

      <div className="student-dashboard-empty-state">
        Select a section to open it.
      </div>
    </div>
  );
};

export default StudentDashboardPage;
