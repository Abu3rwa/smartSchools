/**
 * PaginationBar — reusable pagination control.
 * Returns null if total fits in a single page.
 */
const PaginationBar = ({ page, total, pageSize, onPage }) => {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;
  return (
    <div className="teacher-ae-pagination">
      <button type="button" className="teacher-ae-btn" disabled={page === 1} onClick={() => onPage(1)}>«</button>
      <button type="button" className="teacher-ae-btn" disabled={page === 1} onClick={() => onPage(page - 1)}>‹</button>
      <span className="teacher-ae-pagination-info">{page} / {totalPages}</span>
      <button type="button" className="teacher-ae-btn" disabled={page === totalPages} onClick={() => onPage(page + 1)}>›</button>
      <button type="button" className="teacher-ae-btn" disabled={page === totalPages} onClick={() => onPage(totalPages)}>»</button>
    </div>
  );
};

export default PaginationBar;
