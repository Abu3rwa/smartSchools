import { useState } from 'react';
import QuestionPoolImportPanel from '../QuestionPoolImportPanel';

const StandardAssignQuestionImport = ({ t, formData, setFormData, importContext }) => {
    const [open, setOpen] = useState(false);
    const imported = Array.isArray(formData.importedQuestions) ? formData.importedQuestions : [];

    const handleImport = (questions) => {
        setFormData({ ...formData, importedQuestions: questions });
        setOpen(false);
    };

    const handleClear = () => setFormData({ ...formData, importedQuestions: [] });

    return (
        <div className="form-group">
            <label>{t('standardAssign:questionImport.wizardLabel')}</label>
            {imported.length > 0 ? (
                <div className="question-pool-item">
                    <p>
                        <strong>
                            {t('standardAssign:questionImport.wizardReady', { count: imported.length })}
                        </strong>
                    </p>
                    <small className="text-muted">
                        {t('standardAssign:questionImport.wizardReadyHint')}
                    </small>
                    <div className="question-pool-editor-actions" style={{ marginTop: 8, gap: 8 }}>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>
                            {t('standardAssign:questionImport.wizardReplace')}
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={handleClear}>
                            {t('standardAssign:questionImport.wizardClear')}
                        </button>
                    </div>
                </div>
            ) : (
                <div>
                    <small className="text-muted" style={{ display: 'block', marginBottom: 8 }}>
                        {t('standardAssign:questionImport.wizardHintEmpty')}
                    </small>
                    {!open && (
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>
                            {t('standardAssign:questionImport.openButton')}
                        </button>
                    )}
                </div>
            )}
            {open && (
                <QuestionPoolImportPanel
                    context={importContext}
                    hideMode
                    onImport={handleImport}
                    onCancel={() => setOpen(false)}
                />
            )}
        </div>
    );
};

export default StandardAssignQuestionImport;
