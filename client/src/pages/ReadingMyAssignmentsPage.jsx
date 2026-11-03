import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSelector } from "react-redux";
import { HiOutlineBookOpen, HiOutlineViewList } from "react-icons/hi";
import { selectCurrentAcademicYear } from "../store/slices/uiSlice";
import ReadingAssignmentCards from "./student/reading/ReadingAssignmentCards.jsx";
import ReadingBookPage from "./student/reading/ReadingViewPage/ReadingBookPage.jsx";
import {
  readViewMode,
  writeViewMode,
} from "./student/reading/ReadingViewPage/book/readingBookStorage.js";
import "./ReadingMyAssignmentsPage.css";

const ReadingMyAssignmentsPage = () => {
  const { t } = useTranslation(["reading"]);
  const academicYear = useSelector(selectCurrentAcademicYear);
  const [mode, setMode] = useState(readViewMode);

  const switchMode = (next) => {
    writeViewMode(next);
    setMode(next);
  };

  return (
    <div
      className={`reading-my-assignments-page${mode === "book" ? " is-book" : ""}`}
    >
      <div className="page-header reading-home-header">
        <div className="reading-home-heading">
          <h1>{t("reading:my.title")}</h1>
        </div>
        <div
          className="reading-view-toggle"
          role="group"
          aria-label={t("reading:my.viewLabel")}
        >
          <button
            type="button"
            className={mode === "book" ? "is-active" : ""}
            aria-pressed={mode === "book"}
            onClick={() => switchMode("book")}
          >
            <HiOutlineBookOpen size={16} />
            {t("reading:my.bookView")}
          </button>
          <button
            type="button"
            className={mode === "list" ? "is-active" : ""}
            aria-pressed={mode === "list"}
            onClick={() => switchMode("list")}
          >
            <HiOutlineViewList size={16} />
            {t("reading:my.listView")}
          </button>
        </div>
      </div>

      {mode === "book" ? <ReadingBookPage /> : <ReadingAssignmentCards />}
    </div>
  );
};

export default ReadingMyAssignmentsPage;
