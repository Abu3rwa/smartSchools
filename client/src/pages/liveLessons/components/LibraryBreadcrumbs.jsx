import {
  HiOutlineChevronRight,
  HiOutlineHome,
} from "react-icons/hi2";

const LibraryBreadcrumbs = ({ breadcrumbFolders, onNavigateLibrary }) => (
  <nav className="live-library-crumbs" aria-label="Folder path">
    <button type="button" onClick={() => onNavigateLibrary("home")}>
      <HiOutlineHome aria-hidden="true" /> Folders
    </button>
    {breadcrumbFolders.map((folder, index) => {
      const last = index === breadcrumbFolders.length - 1;
      return (
        <span className="live-crumb" key={folder._id}>
          <HiOutlineChevronRight
            className="live-crumb-sep"
            aria-hidden="true"
          />
          {last ? (
            <span aria-current="page">{folder.name}</span>
          ) : (
            <button
              type="button"
              onClick={() => onNavigateLibrary("folder", String(folder._id))}
            >
              {folder.name}
            </button>
          )}
        </span>
      );
    })}
  </nav>
);

export default LibraryBreadcrumbs;
