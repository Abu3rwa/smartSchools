import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../config/api';
import './ParentPlpReportPage.css';

const ParentPlpReportPage = () => {
    const { childId } = useParams();
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let active = true;
        const loadReport = async () => {
            try {
                setLoading(true);
                const response = await api.get(`/parent/children/${childId}/plp-report`);
                if (active) setReport(response.data.data);
            } catch (requestError) {
                if (active) setError(requestError.response?.data?.message || 'Unable to load the character development report.');
            } finally {
                if (active) setLoading(false);
            }
        };
        loadReport();
        return () => { active = false; };
    }, [childId]);

    if (loading) return <div className="parent-plp-report report-state">Loading report...</div>;
    if (error) return <div className="parent-plp-report report-state report-error">{error}</div>;
    if (!report) return <div className="parent-plp-report report-state">No report available.</div>;

    const student = report.student || {};
    const hasAcademic = report.academicEffort?.length > 0;
    const hasSupport = report.support?.length > 0;

    return (
        <main className="parent-plp-report">
            <header className="report-heading">
                <p className="report-kicker">Personal Learning Portfolio</p>
                <h1>Student Development Report</h1>
                <p>{report.academicYear}</p>
            </header>

            <table className="student-information">
                <tbody>
                    <tr><th>Student Name</th><td>{student.name || '-'}</td><th>Student ID</th><td>{student.studentId || '-'}</td></tr>
                    <tr><th>Class</th><td>{student.class || report.className || '-'}</td><th>Grade</th><td>{student.grade || '-'}</td></tr>
                    <tr><th>Academic Year</th><td>{report.academicYear || '-'}</td><th>Reporting Period</th><td>{report.records?.map((item) => item.round || `Month ${item.month}`).filter(Boolean).join(', ') || '-'}</td></tr>
                </tbody>
            </table>

            <section className="report-section">
                <h2>Social-Emotional Development</h2>
                {report.traits?.length ? (
                    <table className="trait-table">
                        <thead><tr><th>Character Trait</th><th>Observed Indicators</th><th>Evidence Count</th></tr></thead>
                        <tbody>{report.traits.map((trait) => (
                            <tr key={trait.trait}>
                                <td><strong>{trait.trait}</strong></td>
                                <td><ul>{(trait.indicators || []).map((indicator) => <li key={indicator}>{indicator}</li>)}</ul></td>
                                <td>{trait.count}</td>
                            </tr>
                        ))}</tbody>
                    </table>
                ) : <p className="empty-copy">No character observations have been recorded for this period.</p>}
            </section>

            {report.characterGoals?.length > 0 && (
                <section className="report-section">
                    <h2>Teacher Feedback</h2>
                    <h3>Affirmation</h3>
                    {report.teacherFeedback?.length ? report.teacherFeedback.map((item) => <p key={item.title}><strong>{item.title}:</strong> {item.comment}</p>) : <p className="empty-copy">The teacher has not added an affirmation yet.</p>}
                    <h3>Challenge</h3>
                    <table className="goal-table"><thead><tr><th>Goal</th><th>Next Step</th><th>Progress</th></tr></thead><tbody>{report.characterGoals.map((goal) => <tr key={goal.title}><td>{goal.title}</td><td>{goal.successCriteria || goal.description || '-'}</td><td>{goal.status}</td></tr>)}</tbody></table>
                </section>
            )}

            {hasAcademic && (
                <section className="report-section">
                    <h2>Academic Effort</h2>
                    <table className="goal-table"><thead><tr><th>Subject</th><th>Observed Strength</th><th>Growth Goal</th><th>Comment on Previous Goal</th></tr></thead><tbody>{report.academicEffort.map((item, index) => <tr key={`${item.subject}-${index}`}><td>{item.subject}</td><td>{item.observedStrength || '-'}</td><td>{item.growthGoal || '-'}</td><td>{item.previousGoalComment || '-'}</td></tr>)}</tbody></table>
                </section>
            )}

            {hasSupport && (
                <section className="report-section"><h2>Extra Support / Accommodations</h2><ul>{report.support.map((item) => <li key={item}>{item}</li>)}</ul></section>
            )}

            {!report.characterGoals?.length && !hasAcademic && !hasSupport && <p className="empty-copy report-section">There are no additional goals or support notes for this reporting period.</p>}
            <footer className="report-footer">Prepared for the student and family.</footer>
        </main>
    );
};

export default ParentPlpReportPage;
