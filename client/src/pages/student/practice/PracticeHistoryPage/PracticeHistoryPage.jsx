import { useNavigate } from 'react-router-dom';
import { usePracticeHistoryData } from './hooks/usePracticeHistoryData.js';
import PracticeHistoryHeader from './components/PracticeHistoryHeader.jsx';
import PracticeHistoryList from './components/PracticeHistoryList.jsx';
import PracticeHistoryEmptyState from './components/PracticeHistoryEmptyState.jsx';
import PracticeHistoryLoadingState from './components/PracticeHistoryLoadingState.jsx';
import './PracticeHistoryPage.css';

/**
 * Practice History page. Student role only. Route: /portal/practice/:assignmentId/history.
 */
export default function PracticeHistoryPage() {
    const navigate = useNavigate();
    const { assignmentId, assignment, history, mastery, loading } = usePracticeHistoryData();

    const handleBack = () => navigate('/portal/practice');
    const handleStartPracticing = (id) => navigate(`/portal/practice/${id}`);

    return (
        <div className="practice-history">
            <PracticeHistoryHeader
                assignment={assignment}
                mastery={mastery}
                onBack={handleBack}
            />

            {loading ? (
                <PracticeHistoryLoadingState />
            ) : history.length === 0 ? (
                <PracticeHistoryEmptyState
                    assignmentId={assignmentId}
                    onStartPracticing={handleStartPracticing}
                />
            ) : (
                <PracticeHistoryList history={history} />
            )}
        </div>
    );
}
