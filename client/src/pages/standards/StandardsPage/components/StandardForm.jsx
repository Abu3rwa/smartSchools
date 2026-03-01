import { GRADE_LEVEL_OPTIONS } from '../constants';
import { toUppercaseCode } from '../utils/standardsPagePresentation';

const StandardForm = ({ formData, onFormDataChange, subjects }) => {
    return (
        <div className="modal-body">
            <div className="form-row">
                <div className="form-group">
                    <label>Code *</label>
                    <input
                        type="text"
                        value={formData.code}
                        onChange={(event) =>
                            onFormDataChange({
                                ...formData,
                                code: toUppercaseCode(event.target.value)
                            })
                        }
                        required
                        placeholder="e.g., CCSS.MATH.4.OA.1"
                    />
                </div>
                <div className="form-group">
                    <label>Name *</label>
                    <input
                        type="text"
                        value={formData.name}
                        onChange={(event) =>
                            onFormDataChange({
                                ...formData,
                                name: event.target.value
                            })
                        }
                        required
                        placeholder="e.g., Multiplication Equations"
                    />
                </div>
            </div>
            <div className="form-group">
                <label>Description *</label>
                <textarea
                    value={formData.description}
                    onChange={(event) =>
                        onFormDataChange({
                            ...formData,
                            description: event.target.value
                        })
                    }
                    required
                    rows={3}
                    placeholder="Full description of the standard..."
                />
            </div>
            <div className="form-row">
                <div className="form-group">
                    <label>Subject *</label>
                    <select
                        value={formData.subject}
                        onChange={(event) =>
                            onFormDataChange({
                                ...formData,
                                subject: event.target.value
                            })
                        }
                        required
                    >
                        <option value="">Select Subject</option>
                        {subjects.map((subject) => (
                            <option key={subject._id} value={subject._id}>
                                {subject.name}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="form-group">
                    <label>Grade Level *</label>
                    <select
                        value={formData.gradeLevel}
                        onChange={(event) =>
                            onFormDataChange({
                                ...formData,
                                gradeLevel: parseInt(event.target.value)
                            })
                        }
                        required
                    >
                        <option value="">Select Grade</option>
                        {GRADE_LEVEL_OPTIONS.map((grade) => (
                            <option key={grade} value={grade}>
                                Grade {grade}
                            </option>
                        ))}
                    </select>
                </div>
            </div>
            <div className="form-group">
                <label>Category / Domain</label>
                <input
                    type="text"
                    value={formData.category}
                    onChange={(event) =>
                        onFormDataChange({
                            ...formData,
                            category: event.target.value
                        })
                    }
                    placeholder="e.g., Operations & Algebraic Thinking"
                />
            </div>
            <div className="form-row">
                <div className="form-group">
                    <label>Mastery Threshold (%)</label>
                    <input
                        type="number"
                        value={formData.masteryThreshold}
                        onChange={(event) =>
                            onFormDataChange({
                                ...formData,
                                masteryThreshold: parseInt(event.target.value) || 80
                            })
                        }
                        min={1}
                        max={100}
                    />
                </div>
                <div className="form-group">
                    <label>Minimum Questions</label>
                    <input
                        type="number"
                        value={formData.masteryMinQuestions}
                        onChange={(event) =>
                            onFormDataChange({
                                ...formData,
                                masteryMinQuestions: parseInt(event.target.value) || 5
                            })
                        }
                        min={1}
                        max={50}
                    />
                </div>
            </div>
        </div>
    );
};

export default StandardForm;
