import PracticeHistoryBackLink from './PracticeHistoryBackLink.jsx';
import PracticeHistoryAssignmentHeader from './PracticeHistoryAssignmentHeader.jsx';

/**
 * Header section: back link + assignment header.
 */
export default function PracticeHistoryHeader({ assignment, mastery, onBack }) {
    return (
        <>
            <PracticeHistoryBackLink onClick={onBack} />
            <PracticeHistoryAssignmentHeader assignment={assignment} mastery={mastery} />
        </>
    );
}
