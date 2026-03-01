import { HiOutlineSparkles } from 'react-icons/hi';
import {
    getClassCategoryAverage,
    getClassOverallAverage,
    getStudentCategoryAverage,
    getStudentOverallAverage
} from '../utils/gradebookPresentation';

const GradebookTable = ({
    loading,
    students,
    grades,
    dynamicCategories,
    processedData,
    onOpenAIModal
}) => {
    if (loading) {
        return (
            <div className="loading-container">
                <div className="spinner"></div>
            </div>
        );
    }

    return (
        <div className="card">
            <div className="table-container">
                <table className="gradebook-table">
                    <thead>
                        <tr>
                            <th>Student</th>
                            {dynamicCategories.map((category) => (
                                <th key={category} className="text-center">{category} (Avg %)</th>
                            ))}
                            <th className="text-center">Overall (Avg %)</th>
                        </tr>
                    </thead>

                    <tbody>
                        {students.map((student) => {
                            const studentData = processedData[student._id] || { categories: {}, overallTotal: 0, overallCount: 0 };
                            const overallAverage = getStudentOverallAverage(studentData);

                            return (
                                <tr key={student._id}>
                                    <td>
                                        <div className="student-cell" style={{ justifyContent: 'space-between' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <div className="avatar-sm">
                                                    {student.firstName?.charAt(0)}
                                                    {student.lastName?.charAt(0)}
                                                </div>
                                                <span>{student.firstName} {student.lastName}</span>
                                            </div>

                                            <button
                                                className="btn-icon"
                                                title="Generate Progress Report"
                                                onClick={() => onOpenAIModal(student)}
                                                style={{ color: '#8b5cf6' }}
                                            >
                                                <HiOutlineSparkles size={18} />
                                            </button>
                                        </div>
                                    </td>

                                    {dynamicCategories.map((category) => {
                                        const average = getStudentCategoryAverage(studentData, category);
                                        return (
                                            <td key={category} className="text-center font-mono">
                                                {average}%
                                            </td>
                                        );
                                    })}

                                    <td className="text-center font-bold font-mono">{overallAverage}%</td>
                                </tr>
                            );
                        })}

                        {students.length === 0 && (
                            <tr>
                                <td colSpan={dynamicCategories.length + 2} className="empty-row">
                                    No students in this class
                                </td>
                            </tr>
                        )}
                    </tbody>

                    <tfoot>
                        <tr className="class-average-row" style={{ fontWeight: 'bold' }}>
                            <td style={{ padding: '12px' }}>Class Average</td>
                            {dynamicCategories.map((category) => {
                                const average = getClassCategoryAverage({ students, processedData, category });
                                return (
                                    <td key={category} className="text-center">
                                        {average}%
                                    </td>
                                );
                            })}
                            <td className="text-center">{getClassOverallAverage({ students, processedData })}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            {grades.length === 0 && (
                <div className="empty-state">
                    <p>No grades found for this month.</p>
                </div>
            )}
        </div>
    );
};

export default GradebookTable;
