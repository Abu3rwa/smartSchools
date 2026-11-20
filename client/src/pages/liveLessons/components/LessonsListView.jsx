import {
  HiOutlineCheck,
  HiOutlineFolder,
  HiOutlineFunnel,
  HiOutlineMagnifyingGlass,
  HiOutlinePlus,
  HiOutlinePresentationChartBar,
} from "react-icons/hi2";
import LessonActionMenu from "./LessonActionMenu";
import LessonRow from "./LessonRow";
import PaginationBar from "./PaginationBar";

const LessonsListView = ({
  listState,
  updateLessonList,
  activeFolder,
  childFolders,
  folders,
  folderPaths,
  folderLessonTotal,
  reorderMode,
  folderSaving,
  lessonPage,
  lessonPages,
  lessonLoading,
  lessons,
  userRole,
  selectedLessonIds,
  onTogglePageSelection,
  onToggleLessonSelection,
  onNavigateLibrary,
  lessonFolderByLesson,
  onReorderLesson,
  onSetPosition,
  onPreviewLesson,
  onStartLesson,
  getSessionClassId,
  lessonActionMenu,
  onToggleActionMenu,
  lessonActionMenuRef,
  exportingLessonId,
  onOpenLessonEditor,
  onOpenOrganizeDialog,
  onRemoveShortcut,
  onExportLesson,
  onShareLesson,
  onToggleLessonDone,
  onOpenMoveDialog,
  onDeleteLesson,
  onCloseActionMenu,
  rangeText,
  onClearSearch,
  onImport,
  onUpdatePage,
}) => (
  <section className="live-library-list" aria-label="Lessons in this view">
    {childFolders.length > 0 && (
      <div className="live-subfolder-chips">
        {childFolders.map((folder) => (
          <button
            type="button"
            className="live-subfolder-chip"
            key={folder._id}
            onClick={() =>
              onNavigateLibrary("folder", String(folder._id))
            }
          >
            <span className="live-subfolder-icon">
              <HiOutlineFolder aria-hidden="true" />
            </span>
            {folder.name}
            <span className="live-subfolder-count">
              {folderLessonTotal(String(folder._id))}
            </span>
          </button>
        ))}
      </div>
    )}
    {listState.search &&
      (() => {
        const matches = folders.filter((folder) =>
          folder.name
            .toLowerCase()
            .includes(listState.search.toLowerCase()),
        );
        if (!matches.length) return null;
        return (
          <div className="live-subfolder-chips">
            {matches.map((folder) => (
              <button
                type="button"
                className="live-subfolder-chip"
                key={folder._id}
                onClick={() =>
                  onNavigateLibrary("folder", String(folder._id))
                }
              >
                <span className="live-subfolder-icon">
                  <HiOutlineFolder aria-hidden="true" />
                </span>
                {folderPaths.get(String(folder._id)) ||
                  folder.name}
                <span className="live-subfolder-count">
                  {folderLessonTotal(String(folder._id))}
                </span>
              </button>
            ))}
          </div>
        );
      })()}
    {reorderMode && listState.view === "folder" && (
      <p className="live-library-reorder-hint">
        Arrows adjust the teaching sequence, including across
        pages. Position moves a lesson further without dragging.
      </p>
    )}

    <div className="live-list-table-wrap live-library-table">
      <table className="live-list-table has-select">
        <thead>
          <tr>
            <th>
              {["teacher", "admin"].includes(userRole) && (
                <input
                  type="checkbox"
                  aria-label="Select all lessons on this page"
                  checked={
                    lessons.length > 0 &&
                    lessons.every((lesson) =>
                      selectedLessonIds.includes(
                        String(lesson._id),
                      ),
                    )
                  }
                  onChange={(event) =>
                    onTogglePageSelection(event.target.checked)
                  }
                />
              )}
            </th>
            <th className="live-order-col">#</th>
            <th>Lesson</th>
            <th>Status</th>
            <th>
              {reorderMode && listState.view === "folder"
                ? "Teaching order"
                : "Actions"}
            </th>
          </tr>
        </thead>
        <tbody>
          {lessons.map((lesson, rowIndex) => {
            const position =
              listState.view === "folder" && activeFolder
                ? activeFolder.lessonIds.findIndex(
                    (id) => String(id) === String(lesson._id),
                  ) + 1
                : (lessonPage - 1) *
                    listState.pageSize +
                  rowIndex +
                  1;
            const location = lessonFolderByLesson.get(
              String(lesson._id),
            );
            const selected = selectedLessonIds.includes(
              String(lesson._id),
            );
            return (
              <LessonRow
                key={lesson._id}
                lesson={lesson}
                position={position}
                rowIndex={rowIndex}
                selected={selected}
                location={location}
                view={listState.view}
                activeFolder={activeFolder}
                reorderMode={reorderMode}
                folderSaving={folderSaving}
                userRole={userRole}
                folderPaths={folderPaths}
                onSelect={onToggleLessonSelection}
                onReorder={onReorderLesson}
                onSetPosition={onSetPosition}
                onPreview={onPreviewLesson}
                onStart={onStartLesson}
                getSessionClassId={getSessionClassId}
                actionMenuOpen={
                  lessonActionMenu?.lessonId === String(lesson._id)
                }
                onToggleActionMenu={onToggleActionMenu}
              />
            );
          })}
        </tbody>
      </table>
      {lessonLoading && !lessons.length && (
        <div className="live-list-empty" role="status">
          <span className="live-spinner" aria-hidden="true" />
          <p>Loading lessons…</p>
        </div>
      )}
      {!lessonLoading && !lessons.length && (
        <div className="live-list-empty">
          {listState.search ? (
            <>
              <HiOutlineMagnifyingGlass size={22} aria-hidden="true" />
              <p>No lessons match your search.</p>
              <p className="live-library-empty-note">
                Try a different title or topic. Your folders and
                lessons are unchanged.
              </p>
              <button
                type="button"
                className="live-secondary-button"
                onClick={onClearSearch}
              >
                Clear search
              </button>
            </>
          ) : listState.subject ? (
            <>
              <HiOutlineFunnel size={22} aria-hidden="true" />
              <p>No lessons match this subject.</p>
              <button
                type="button"
                className="live-secondary-button"
                onClick={() =>
                  updateLessonList({ subject: "", page: 1 })
                }
              >
                Clear subject filter
              </button>
            </>
          ) : listState.view === "folder" ? (
            <>
              <HiOutlineFolder size={22} aria-hidden="true" />
              <p>This folder has no lessons yet.</p>
              <p className="live-library-empty-note">
                Add lessons from All lessons, or import a CSV
                straight into this folder.
              </p>
              <div className="live-library-empty-actions">
                <button
                  type="button"
                  className="live-secondary-button"
                  onClick={() => onNavigateLibrary("all")}
                >
                  Browse all lessons
                </button>
                <button
                  type="button"
                  className="live-primary-button"
                  onClick={onImport}
                >
                  <HiOutlinePlus /> Import into this folder
                </button>
              </div>
            </>
          ) : listState.view === "unfiled" ? (
            <>
              <HiOutlineCheck size={22} aria-hidden="true" />
              <p>Nothing is unfiled.</p>
              <p className="live-library-empty-note">
                Every lesson in your library is inside a folder.
              </p>
              <button
                type="button"
                className="live-secondary-button"
                onClick={() => onNavigateLibrary("home")}
              >
                Back to folders
              </button>
            </>
          ) : (
            <>
              <HiOutlinePresentationChartBar
                size={22}
                aria-hidden="true"
              />
              <p>No lessons yet.</p>
              <button className="live-primary-button" onClick={onImport}>
                <HiOutlinePlus /> Import a lesson
              </button>
            </>
          )}
        </div>
      )}
    </div>
    <LessonActionMenu
      menu={lessonActionMenu}
      menuRef={lessonActionMenuRef}
      activeFolder={activeFolder}
      inFolderView={listState.view === "folder"}
      userRole={userRole}
      exportingLessonId={exportingLessonId}
      onClose={onCloseActionMenu}
      onEdit={onOpenLessonEditor}
      onOrganize={onOpenOrganizeDialog}
      onRemoveShortcut={onRemoveShortcut}
      onExport={onExportLesson}
      onShare={onShareLesson}
      onToggleDone={onToggleLessonDone}
      onMove={onOpenMoveDialog}
      onDelete={onDeleteLesson}
    />
    <PaginationBar
      rangeText={rangeText}
      pageSize={listState.pageSize}
      pageSizeOptions={[25, 50]}
      onPageSizeChange={(pageSize) =>
        updateLessonList({ pageSize, page: 1 })
      }
      prevDisabled={lessonLoading || lessonPage <= 1}
      nextDisabled={lessonLoading || lessonPage >= lessonPages}
      onPrev={() => onUpdatePage(lessonPage - 1)}
      onNext={() => onUpdatePage(lessonPage + 1)}
      pageLabel={`Page ${lessonPage} of ${lessonPages}`}
      prevAriaLabel="Previous page of lessons"
      nextAriaLabel="Next page of lessons"
    />
  </section>
);

export default LessonsListView;
