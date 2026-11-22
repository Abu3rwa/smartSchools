import { useRef } from "react";
import {
  HiOutlineArrowUpTray,
  HiOutlineClock,
  HiOutlineCog6Tooth,
  HiOutlineFolderPlus,
  HiOutlinePresentationChartBar,
  HiOutlineSparkles,
  HiOutlineTrash,
} from "react-icons/hi2";
import { useFeatureNamespaces } from "../../../i18n/useFeatureNamespaces";

const AI_REASON_KEYS = {
  platform_disabled: "entry.disabledPlatform",
  role_not_allowed: "entry.disabledRole",
  school_disabled: "entry.disabledSchool",
  model_unpriced: "entry.disabledModel",
};

const LiveLessonsHeader = ({
  libraryTotal,
  sessionTotal,
  userRole,
  tab,
  onTabChange,
  onNewFolder,
  onImport,
  onCreateWithAi,
  aiBuilder,
  folderSaving,
  onDeleteFinishedSessions,
  deletingFinishedSessions,
}) => {
  const { t } = useFeatureNamespaces("liveLessonBuilder");
  const aiAvailable = aiBuilder?.available === true;
  const aiReason = t(AI_REASON_KEYS[aiBuilder?.reason] || "entry.disabledPlatform");
  const liveTabs = [
    {
      key: "lessons",
      label: "My lessons",
      Icon: HiOutlinePresentationChartBar,
      badge: libraryTotal,
    },
    {
      key: "sessions",
      label: "Session history",
      Icon: HiOutlineClock,
      badge: sessionTotal,
    },
    ...(userRole === "admin"
      ? [
          {
            key: "settings",
            label: "School settings",
            Icon: HiOutlineCog6Tooth,
            badge: 0,
          },
        ]
      : []),
  ];
  const liveTabRefs = useRef([]);
  const focusLiveTab = (index) => {
    const next = liveTabs[index];
    if (!next) return;
    onTabChange(next.key);
    liveTabRefs.current[index]?.focus();
  };
  const onLiveTabKeyDown = (event, index) => {
    if (event.key === "Home") {
      event.preventDefault();
      focusLiveTab(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      focusLiveTab(liveTabs.length - 1);
      return;
    }
    const rtl = document.documentElement.getAttribute("dir") === "rtl";
    const step =
      event.key === "ArrowRight"
        ? rtl
          ? -1
          : 1
        : event.key === "ArrowLeft"
          ? rtl
            ? 1
            : -1
          : 0;
    if (!step) return;
    event.preventDefault();
    focusLiveTab((index + step + liveTabs.length) % liveTabs.length);
  };

  return (
    <header className="live-page-head">
      <div className="live-page-title">
        <h1>Live lessons</h1>
        <span className="live-page-count">
          {libraryTotal} {libraryTotal === 1 ? "lesson" : "lessons"}
        </span>
      </div>
      <nav
        className="live-lessons-tabs"
        role="tablist"
        aria-label="Live lesson sections"
      >
        {liveTabs.map(({ key, label, Icon, badge }, index) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              id={`live-tab-${key}`}
              ref={(node) => {
                liveTabRefs.current[index] = node;
              }}
              aria-selected={active}
              aria-controls="live-lessons-panel"
              tabIndex={active ? 0 : -1}
              className={active ? "active" : ""}
              onClick={() => onTabChange(key)}
              onKeyDown={(event) => onLiveTabKeyDown(event, index)}
            >
              <Icon size={17} aria-hidden="true" />
              <span className="live-tab-label">{label}</span>
              {badge > 0 && <span className="live-tab-count">{badge}</span>}
            </button>
          );
        })}
      </nav>
      <div className="live-topbar-actions">
        {tab === "lessons" && (
          <>
            <button
              type="button"
              className="live-ai-button"
              onClick={onCreateWithAi}
              disabled={!aiAvailable}
              title={aiAvailable ? t("entry.buildWithAi") : aiReason}
              aria-label={aiAvailable ? t("entry.buildWithAi") : aiReason}
            >
              <HiOutlineSparkles aria-hidden="true" />
              {t("entry.buildWithAi")}
            </button>
            <button
              className="live-secondary-button"
              onClick={onNewFolder}
              disabled={folderSaving}
            >
              <HiOutlineFolderPlus /> New folder
            </button>
            <button className="live-primary-button" onClick={onImport}>
              <HiOutlineArrowUpTray /> Import CSV lesson
            </button>
          </>
        )}
        {tab === "sessions" && ["teacher", "admin"].includes(userRole) && (
          <button
            className="live-delete-session"
            onClick={onDeleteFinishedSessions}
            disabled={deletingFinishedSessions}
          >
            <HiOutlineTrash />
            {deletingFinishedSessions
              ? "Deleting finished sessions…"
              : "Delete all finished sessions"}
          </button>
        )}
      </div>
    </header>
  );
};

export default LiveLessonsHeader;
