const VIEW_MODE_KEY = 'gb.reading.viewMode';
const LAST_PAGE_PREFIX = 'gb.reading.lastPage.';

const read = (key) => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key, value) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private mode or a full quota should not break the book.
  }
};

export const readViewMode = () => (read(VIEW_MODE_KEY) === 'list' ? 'list' : 'book');

export const writeViewMode = (mode) => write(VIEW_MODE_KEY, mode === 'list' ? 'list' : 'book');

export const readLastPage = (assignmentId) => {
  if (!assignmentId) return null;
  const raw = read(`${LAST_PAGE_PREFIX}${assignmentId}`);
  if (raw === null || raw === '') return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : null;
};

export const writeLastPage = (assignmentId, pageIndex) => {
  if (!assignmentId || !Number.isInteger(pageIndex) || pageIndex < 0) return;
  write(`${LAST_PAGE_PREFIX}${assignmentId}`, String(pageIndex));
};
