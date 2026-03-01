import { getGradeClass, getMonthShortName } from '../utils/gradeReportPresentation';

const SubjectPerformanceGrid = ({ subjects = [] }) => {
    return (
        <div className="card">
            <div className="card-header">
                <h3 className="card-title">Subject Performance</h3>
            </div>

            <div className="subjects-grid">
                {subjects.map((subject, index) => (
                    <div key={index} className="subject-card">
                        <div className="subject-header">
                            <h4>{subject.subjectName}</h4>
                            <span className="subject-code">{subject.subjectCode}</span>
                        </div>

                        <div className="subject-grades">
                            <div className="grade-item">
                                <span className="label">Overall</span>
                                <span className={`value ${getGradeClass(subject.overallAverage)}`}>
                                    {subject.overallAverage || 0}%
                                </span>
                            </div>
                            <div className="grade-item">
                                <span className="label">Semester 1</span>
                                <span className="value">{subject.semester1Average || 0}%</span>
                            </div>
                            <div className="grade-item">
                                <span className="label">Semester 2</span>
                                <span className="value">{subject.semester2Average || 0}%</span>
                            </div>
                        </div>

                        <div className="monthly-breakdown">
                            <h5>Monthly Averages</h5>
                            <div className="months-grid">
                                {Object.entries(subject.monthlyAverages || {}).map(([month, data]) => (
                                    <div key={month} className="month-item">
                                        <span className="month-name">{getMonthShortName(month)}</span>
                                        <span className={`month-value ${getGradeClass(data.average)}`}>
                                            {data.average}%
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {subjects.length === 0 && (
                <div className="empty-state">
                    <p>No grades recorded for this student yet.</p>
                </div>
            )}
        </div>
    );
};

export default SubjectPerformanceGrid;
