import { HiOutlineMagnifyingGlass, HiOutlineXMark } from "react-icons/hi2";

const LibraryToolbar = ({
  searchValue,
  onSearchChange,
  onClearSearch,
  subjects,
  showSubjectFilter,
  subjectValue,
  onSubjectChange,
  view,
  onNavigateLibrary,
  unfiledCount,
  folderSort,
  onFolderSortChange,
  reorderMode,
  onToggleReorder,
  order,
  onOrderChange,
  folderSaving,
  userRole,
  lessonTotal,
  onToggleAllFiltered,
  selectingAllLessons,
  filteredSelectionActive,
}) => {
  const lessonSortValue =
    view === "folder" ? order : order === "az" ? "az" : "recent";
  const canSelectAll =
    ["teacher", "admin"].includes(userRole) && lessonTotal > 0;

  return (
    <div className="live-library-controls">
      <label className="live-library-search">
        <HiOutlineMagnifyingGlass aria-hidden="true" />
        <input
          type="search"
          value={searchValue}
          placeholder="Search all lessons and folders…"
          aria-label="Search all lessons and folders"
          onChange={(event) => onSearchChange(event.target.value)}
        />
        {searchValue && (
          <button type="button" aria-label="Clear search" onClick={onClearSearch}>
            <HiOutlineXMark />
          </button>
        )}
      </label>
      {showSubjectFilter && (
        <select
          className="live-library-subject"
          aria-label="Filter by subject"
          value={subjectValue}
          onChange={(event) => onSubjectChange(event.target.value)}
        >
          <option value="">All subjects</option>
          {subjects.map((subject) => (
            <option key={subject._id} value={subject._id}>
              {subject.name}
            </option>
          ))}
        </select>
      )}
      <nav className="live-library-views" aria-label="Library views">
        <button
          type="button"
          aria-pressed={view === "home"}
          onClick={() => onNavigateLibrary("home")}
        >
          Folders
        </button>
        <button
          type="button"
          aria-pressed={view === "all" || view === "search"}
          onClick={() => onNavigateLibrary("all")}
        >
          All lessons
        </button>
        <button
          type="button"
          aria-pressed={view === "unfiled"}
          onClick={() => onNavigateLibrary("unfiled")}
        >
          Unfiled
          <span className="live-library-view-count">{unfiledCount}</span>
        </button>
      </nav>
      {view === "home" ? (
        <div className="live-library-sort">
          <select
            value={folderSort}
            aria-label="Sort folders"
            onChange={(event) => onFolderSortChange(event.target.value)}
          >
            <option value="order">My order</option>
            <option value="az">Name A–Z</option>
          </select>
          <button
            type="button"
            className={
              reorderMode ? "live-primary-button" : "live-secondary-button"
            }
            aria-pressed={reorderMode}
            disabled={folderSort !== "order"}
            title={
              folderSort === "order"
                ? "Change the folder order"
                : "Choose My order first"
            }
            onClick={() => onToggleReorder()}
          >
            {reorderMode ? "Done" : "Reorder"}
          </button>
        </div>
      ) : (
        <>
          <div className="live-library-sort">
            <label>
              Sort
              <select
                aria-label="Sort lessons"
                value={lessonSortValue}
                onChange={(event) => onOrderChange(event.target.value)}
              >
                {view === "folder" && (
                  <option value="teaching">Teaching order</option>
                )}
                <option value="az">Name A–Z</option>
                <option value="recent">Recently updated</option>
              </select>
            </label>
            {view === "folder" && order === "teaching" && (
              <button
                type="button"
                className={
                  reorderMode ? "live-primary-button" : "live-secondary-button"
                }
                aria-pressed={reorderMode}
                disabled={folderSaving}
                onClick={() => onToggleReorder()}
              >
                {reorderMode ? "Done ordering" : "Reorder"}
              </button>
            )}
          </div>
          {canSelectAll && (
            <button
              type="button"
              className="live-text-button live-library-select-all"
              onClick={onToggleAllFiltered}
              disabled={selectingAllLessons}
            >
              {filteredSelectionActive
                ? "Clear all filtered selections"
                : selectingAllLessons
                  ? "Selecting lessons…"
                  : `Select all filtered (${lessonTotal})`}
            </button>
          )}
        </>
      )}
    </div>
  );
};

export default LibraryToolbar;
