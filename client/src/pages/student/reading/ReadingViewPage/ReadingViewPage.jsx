import { useLocation, useParams, useSearchParams } from 'react-router-dom';
import ReadingBookPage from './ReadingBookPage.jsx';
import ReadingScrollPage from './ReadingScrollPage.jsx';
import { readViewMode } from './book/readingBookStorage.js';

const ReadingViewPage = () => {
  const { textId } = useParams();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const assignmentId = location.state?.assignmentId || searchParams.get('assignmentId') || null;

  if (readViewMode() === 'list') {
    return <ReadingScrollPage textId={textId} assignmentId={assignmentId} />;
  }

  return (
    <ReadingBookPage
      startAssignmentId={assignmentId}
      startTextId={textId}
      showBack
    />
  );
};

export default ReadingViewPage;
