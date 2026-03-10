import { GRADE_LEVEL_OPTIONS } from '../constants';
import { useTranslation } from 'react-i18next';
import { toUppercaseCode } from '../utils/standardsPagePresentation';

const StandardForm = ({ formData, onFormDataChange, subjects }) => {
    const { t } = useTranslation(['standards']);

    return (
        <div className="modal-body">
            <div className="form-row">
                <div className="form-group">
                    <label>{t('standards:form.code')}</label>
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
                        placeholder={t('standards:form.codePlaceholder')}
                    />
                </div>
                <div className="form-group">
                    <label>{t('standards:form.name')}</label>
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
                        placeholder={t('standards:form.namePlaceholder')}
                    />
                </div>
            </div>
            <div className="form-group">
                <label>{t('standards:form.description')}</label>
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
                    placeholder={t('standards:form.descriptionPlaceholder')}
                />
            </div>
            <div className="form-row">
                <div className="form-group">
                    <label>{t('standards:form.subject')}</label>
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
                        <option value="">{t('standards:form.selectSubject')}</option>
                        {subjects.map((subject) => (
                            <option key={subject._id} value={subject._id}>
                                {subject.name}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="form-group">
                    <label>{t('standards:form.gradeLevel')}</label>
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
                        <option value="">{t('standards:form.selectGrade')}</option>
                        {GRADE_LEVEL_OPTIONS.map((grade) => (
                            <option key={grade} value={grade}>
                                {t('standards:filters.grade', { grade })}
                            </option>
                        ))}
                    </select>
                </div>
            </div>
            <div className="form-group">
                <label>{t('standards:form.category')}</label>
                <input
                    type="text"
                    value={formData.category}
                    onChange={(event) =>
                        onFormDataChange({
                        ...formData,
                        category: event.target.value
                    })
                    }
                    placeholder={t('standards:form.categoryPlaceholder')}
                />
            </div>
            <div className="form-row">
                <div className="form-group">
                    <label>{t('standards:form.masteryThreshold')}</label>
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
                    <label>{t('standards:form.minimumQuestions')}</label>
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
