import BookShell from './book/BookShell.jsx';

const ReadingBookPage = ({ startAssignmentId = null, startTextId = null, showBack = false }) => (
  <BookShell
    startAssignmentId={startAssignmentId}
    startTextId={startTextId}
    showBack={showBack}
  />
);

export default ReadingBookPage;
