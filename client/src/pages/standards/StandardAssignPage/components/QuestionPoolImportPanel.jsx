import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    MAX_IMPORT_FILE_BYTES,
    buildAiPrompt,
    buildTemplateCsv,
    parseQuestionImport
} from '../utils/questionImportCsv';

const LANGUAGE_NAMES = { en: 'English', ar: 'Arabic' };

const QuestionPoolImportPanel = ({ context, disabled, onImport, onCancel, hideMode = false }) => {
    const { t } = useTranslation(['standardAssign']);
    const fileInputRef = useRef(null);
    const [language, setLanguage] = useState('en');
    const [promptCopied, setPromptCopied] = useState(false);
    const [fileName, setFileName] = useState('');
    const [parsed, setParsed] = useState(null);
    const [fileError, setFileError] = useState('');
    const [mode, setMode] = useState('append');

    const prompt = useMemo(
        () =>
            buildAiPrompt({
                ...(context || {}),
                languageName: LANGUAGE_NAMES[language]
            }),
        [context, language]
    );
    const validRows = parsed?.rows?.filter((row) => row.errors.length === 0) || [];
    const invalidRows = parsed?.rows?.filter((row) => row.errors.length > 0) || [];

    const handleDownloadTemplate = () => {
        const blob = new Blob(['\uFEFF', buildTemplateCsv()], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'question-import-template.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleCopyPrompt = async () => {
        try {
            await navigator.clipboard.writeText(prompt);
        } catch {
            const area = document.createElement('textarea');
            area.value = prompt;
            document.body.appendChild(area);
            area.select();
            document.execCommand('copy');
            document.body.removeChild(area);
        }
        setPromptCopied(true);
        setTimeout(() => setPromptCopied(false), 2000);
    };

    const handleFile = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        setParsed(null);
        setFileError('');
        setFileName(file.name);

        if (file.size > MAX_IMPORT_FILE_BYTES) {
            setFileError(t('standardAssign:questionImport.errors.fileTooLarge'));
            return;
        }
        try {
            const text = await file.text();
            const result = parseQuestionImport(text);
            if (result.fatal) {
                setFileError(
                    t(`standardAssign:questionImport.fatal.${result.fatal}`, result.fatalParams)
                );
                return;
            }
            setParsed(result);
        } catch {
            setFileError(t('standardAssign:questionImport.errors.readFailed'));
        }
    };

    const handleConfirm = () => {
        onImport(
            validRows.map((row) => row.question),
            mode
        );
    };

    return (
        <div className="question-pool-item" style={{ marginBottom: 16 }}>
            <div className="question-pool-item-header">
                <strong>{t('standardAssign:questionImport.title')}</strong>
                {onCancel ? <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>
                    {t('standardAssign:actions.close')}
                </button> : null}
            </div>
            <p className="text-muted">{t('standardAssign:questionImport.intro')}</p>

            <ol style={{ paddingInlineStart: 20, lineHeight: 1.8 }}>
                <li>{t('standardAssign:questionImport.steps.template')}</li>
                <li>{t('standardAssign:questionImport.steps.prompt')}</li>
                <li>{t('standardAssign:questionImport.steps.upload')}</li>
            </ol>

            <div className="form-group">
                <label>{t('standardAssign:questionImport.promptLanguage')}</label>
                <select
                    className="form-input"
                    value={language}
                    onChange={(event) => setLanguage(event.target.value)}
                >
                    <option value="en">{t('standardAssign:questionImport.languages.en')}</option>
                    <option value="ar">{t('standardAssign:questionImport.languages.ar')}</option>
                </select>
            </div>

            <div className="form-group">
                <label>{t('standardAssign:questionImport.promptLabel')}</label>
                <textarea
                    className="form-input"
                    rows={8}
                    value={prompt}
                    readOnly
                    dir="ltr"
                    style={{ fontFamily: 'monospace', fontSize: 12 }}
                />
            </div>

            <div className="question-pool-editor-actions" style={{ flexWrap: 'wrap', gap: 8 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={handleCopyPrompt}>
                    {promptCopied
                        ? t('standardAssign:questionImport.copied')
                        : t('standardAssign:questionImport.copyPrompt')}
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={handleDownloadTemplate}>
                    {t('standardAssign:questionImport.downloadTemplate')}
                </button>
                <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={disabled}
                >
                    {t('standardAssign:questionImport.chooseFile')}
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleFile}
                    style={{ display: 'none' }}
                />
                {fileName ? <span className="text-muted">{fileName}</span> : null}
            </div>

            {fileError ? (
                <div className="question-pool-editor-error" style={{ marginTop: 12 }}>
                    {fileError}
                </div>
            ) : null}

            {parsed ? (
                <div style={{ marginTop: 16 }}>
                    <p>
                        <strong>
                            {t('standardAssign:questionImport.summary', {
                                valid: validRows.length,
                                invalid: invalidRows.length
                            })}
                        </strong>
                    </p>
                    <div style={{ overflowX: 'auto', maxHeight: 280, overflowY: 'auto' }}>
                        <table className="table" style={{ width: '100%' }}>
                            <thead>
                                <tr>
                                    <th>{t('standardAssign:questionImport.table.line')}</th>
                                    <th>{t('standardAssign:questionImport.table.question')}</th>
                                    <th>{t('standardAssign:questionImport.table.type')}</th>
                                    <th>{t('standardAssign:questionImport.table.answer')}</th>
                                    <th>{t('standardAssign:questionImport.table.status')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {parsed.rows.map((row) => (
                                    <tr key={row.line}>
                                        <td>{row.line}</td>
                                        <td>{row.question.questionText || '—'}</td>
                                        <td>
                                            {row.question.questionType === 'true_false'
                                                ? t('standardAssign:questionPool.types.trueFalse')
                                                : t('standardAssign:questionPool.types.multipleChoice')}
                                        </td>
                                        <td>{row.question.correctAnswer || '—'}</td>
                                        <td>
                                            {row.errors.length === 0 ? (
                                                <span className="badge badge-success">
                                                    {t('standardAssign:questionImport.table.ok')}
                                                </span>
                                            ) : (
                                                <span style={{ color: 'var(--danger, #c0392b)' }}>
                                                    {row.errors
                                                        .map((error) =>
                                                            t(`standardAssign:questionImport.rowErrors.${error.code}`)
                                                        )
                                                        .join(' • ')}
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {invalidRows.length > 0 ? (
                        <p className="text-muted" style={{ marginTop: 8 }}>
                            {t('standardAssign:questionImport.skipNote')}
                        </p>
                    ) : null}

                    {!hideMode && <div className="form-group" style={{ marginTop: 12 }}>
                        <label>{t('standardAssign:questionImport.modeLabel')}</label>
                        <select
                            className="form-input"
                            value={mode}
                            onChange={(event) => setMode(event.target.value)}
                        >
                            <option value="append">{t('standardAssign:questionImport.mode.append')}</option>
                            <option value="replace">{t('standardAssign:questionImport.mode.replace')}</option>
                        </select>
                    </div>}

                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleConfirm}
                        disabled={validRows.length === 0 || disabled}
                    >
                        {t('standardAssign:questionImport.confirm', { count: validRows.length })}
                    </button>
                    <p className="text-muted" style={{ marginTop: 8 }}>
                        {hideMode ? t('standardAssign:questionImport.wizardHint') : t('standardAssign:questionImport.saveHint')}
                    </p>
                </div>
            ) : null}
        </div>
    );
};

export default QuestionPoolImportPanel;
