import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import StudentDashboardHeader from "./components/StudentDashboardHeader";
import StudentSectionCard from "./components/StudentSectionCard";
import { selectSchoolFeatures } from "../../../../store/slices/schoolFeaturesSlice";
import { selectUser } from "../../../../store/slices/authSlice";
import { studentNavLinks } from "./utils/studentNavLinks";
import "./StudentDashboardPage.css";

const SECTIONS = ["learning", "practice", "character"];

const StudentDashboardPage = () => {
  const navigate = useNavigate();
  const { t } = useTranslation(["layout.sidebar"]);
  const schoolFeatures = useSelector(selectSchoolFeatures);
  const user = useSelector(selectUser);
  const firstName = user?.firstName ?? "Student";

  const sections = useMemo(
    () =>
      SECTIONS.map((id) => ({
        id,
        items: studentNavLinks.filter((item) => {
          if (item.section !== id) return false;
          if (
            item.liveLessons &&
            import.meta.env.VITE_LIVE_LESSONS_ENABLED !== "true"
          ) {
            return false;
          }
          if (!item.feature) return true;
          return schoolFeatures?.[item.feature] !== false;
        }),
      })).filter((section) => section.items.length > 0),
    [schoolFeatures],
  );

  return (
    <div className="student-dashboard">
      <StudentDashboardHeader firstName={firstName} />

      <div className="student-dashboard-sections">
        {sections.map((section) => (
          <section
            key={section.id}
            className="student-dashboard-group"
            data-group={section.id}
            aria-labelledby={`student-dashboard-group-${section.id}`}
          >
            <h2
              id={`student-dashboard-group-${section.id}`}
              className="student-dashboard-group-title"
            >
              {t(`layout.sidebar:studentDashboard.groups.${section.id}`)}
            </h2>

            <div className="student-dashboard-group-grid">
              {section.items.map((item) => (
                <StudentSectionCard
                  key={item.path}
                  icon={item.icon}
                  label={t(`layout.sidebar:items.${item.labelKey}`)}
                  description={t(
                    `layout.sidebar:studentDashboard.descriptions.${item.labelKey}`,
                  )}
                  onClick={() => navigate(item.path)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};

export default StudentDashboardPage;
