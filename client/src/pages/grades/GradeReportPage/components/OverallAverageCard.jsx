import { getGradeClass, getLetterGrade } from '../utils/gradeReportPresentation';

const OverallAverageCard = ({ report, academicYear }) => {
    if (!report?.overallAverage) {
        return null;
    }

    const overallAverage = Number.parseFloat(report.overallAverage);

    return (
        <div className="overall-card card">
            <div className="overall-content">
                <div className="overall-grade">
                    <span className={`grade-value ${getGradeClass(overallAverage)}`}>
                        {report.overallAverage}%
                    </span>
                    <span className="grade-letter">{getLetterGrade(overallAverage)}</span>
                </div>
                <div className="overall-info">
                    <h3>Overall Average</h3>
                    <p className="text-muted">Based on all subjects for {academicYear}</p>
                </div>
            </div>
        </div>
    );
};

export default OverallAverageCard;
