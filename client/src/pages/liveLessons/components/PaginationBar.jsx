import { HiOutlineChevronLeft, HiOutlineChevronRight } from "react-icons/hi2";

const PaginationBar = ({
  rangeText,
  pageSize,
  pageSizeOptions,
  onPageSizeChange,
  prevDisabled,
  nextDisabled,
  onPrev,
  onNext,
  pageLabel,
  prevAriaLabel,
  nextAriaLabel,
}) => (
  <div className="live-list-pagination">
    <span>Showing {rangeText}</span>
    <label>
      Rows
      <select
        value={pageSize}
        onChange={(event) => onPageSizeChange(Number(event.target.value))}
      >
        {pageSizeOptions.map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>
    </label>
    <button disabled={prevDisabled} onClick={onPrev} aria-label={prevAriaLabel}>
      <HiOutlineChevronLeft aria-hidden="true" />
      Previous
    </button>
    <span aria-live="polite">{pageLabel}</span>
    <button disabled={nextDisabled} onClick={onNext} aria-label={nextAriaLabel}>
      Next
      <HiOutlineChevronRight aria-hidden="true" />
    </button>
  </div>
);

export default PaginationBar;
