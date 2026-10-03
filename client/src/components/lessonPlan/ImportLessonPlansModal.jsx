import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { selectCurrentAcademicYear } from '../../store/slices/uiSlice';
import toast from 'react-hot-toast';
import { HiOutlineX, HiOutlineDownload, HiOutlineUpload } from 'react-icons/hi';
import lessonService from '../../services/lessonService';
import { downloadBlob } from '../../utils/downloadBlob';
import './ImportLessonPlansModal.css';

const MAX_FILE_BYTES = 900 * 1024;

const csvCell = (value) => {
    let text = String(value ?? '');
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const IssueTable = ({ title, items, t }) => {
    if (!items?.length) return null;
    return (
        <div className="lp-import-issues">
            <h4>{title} ({items.length})</h4>
            <div className="lp-import-issues__scroll">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>{t('lessonPlan:import.row')}</th>
                            <th>{t('lessonPlan:import.column')}</th>
                            <th>{t('lessonPlan:import.message')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.slice(0, 200).map((item, index) => (
                            <tr key={`${item.row}-${item.column}-${index}`}>
                                <td>{item.row}</td>
                                <td>{item.column}</td>
                                <td>{item.message}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const ImportLessonPlansModal = ({ onClose, onImported }) => {
    const { t } = useTranslation(['lessonPlan']);
    const academicYear = useSelector(selectCurrentAcademicYear);
    const fileInputRef = useRef(null);
    const [csv, setCsv] = useState('');
    const [fileName, setFileName] = useState('');
    const [result, setResult] = useState(null);
    const [busy, setBusy] = useState(false);
    const [committing, setCommitting] = useState(false);

    const handleFile = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        if (!/\.csv$/i.test(file.name)) {
            toast.error(t('lessonPlan:import.notCsv'));
            return;
        }
        if (file.size > MAX_FILE_BYTES) {
            toast.error(t('lessonPlan:import.tooLarge'));
            return;
        }
        const text = await file.text();
        setCsv(text);
        setFileName(file.name);
        setResult(null);
    };

    const handlePreview = async () => {
        setBusy(true);
        try {
            setResult(await lessonService.previewImport(csv, academicYear));
        } catch (error) {
            setResult(null);
            toast.error(error.response?.data?.message || t('lessonPlan:import.failed'));
        } finally {
            setBusy(false);
        }
    };

    const handleCommit = async () => {
        setCommitting(true);
        try {
            const response = await lessonService.commitImport(csv, academicYear);
            toast.success(t('lessonPlan:import.success', { count: response.summary?.imported || 0 }));
            onImported?.();
            onClose();
        } catch (error) {
            toast.error(error.response?.data?.message || t('lessonPlan:import.failed'));
        } finally {
            setCommitting(false);
        }
    };

    const handleErrorReport = () => {
        const lines = ['type,row,column,message'];
        (result?.errors || []).forEach((e) => lines.push(['error', e.row, e.column, e.message].map(csvCell).join(',')));
        (result?.warnings || []).forEach((w) => lines.push(['warning', w.row, w.column, w.message].map(csvCell).join(',')));
        downloadBlob(new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' }), 'lesson-plans-import-report.csv');
    };

    const summary = result?.summary;

    return (
        <div className="lp-import-overlay" role="presentation">
            <div className="lp-import-modal" role="dialog" aria-modal="true" aria-labelledby="lp-import-title">
                <div className="lp-import-header">
                    <h2 id="lp-import-title">{t('lessonPlan:import.title')}</h2>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label={t('lessonPlan:import.close')}>
                        <HiOutlineX size={18} />
                    </button>
                </div>
                <p className="text-muted">{t('lessonPlan:import.description')}</p>

                <div className="lp-import-actions">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => lessonService.downloadImportTemplate().catch(() => toast.error(t('lessonPlan:import.failed')))}>
                        <HiOutlineDownload size={16} /> {t('lessonPlan:import.downloadTemplate')}
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileInputRef.current?.click()}>
                        <HiOutlineUpload size={16} /> {fileName || t('lessonPlan:import.chooseFile')}
                    </button>
                    <input ref={fileInputRef} type="file" accept=".csv,text/csv" hidden onChange={handleFile} />
                    <button type="button" className="btn btn-primary btn-sm" disabled={!csv || busy} onClick={handlePreview}>
                        {busy ? t('lessonPlan:import.previewing') : t('lessonPlan:import.preview')}
                    </button>
                </div>

                {summary && (
                    <>
                        <div className="lp-import-summary">
                            <div><strong>{summary.totalRows}</strong><span>{t('lessonPlan:import.totalRows')}</span></div>
                            <div className="ok"><strong>{summary.validRows}</strong><span>{t('lessonPlan:import.validRows')}</span></div>
                            <div className="bad"><strong>{summary.errorRows}</strong><span>{t('lessonPlan:import.errorRows')}</span></div>
                            <div><strong>{summary.skippedDuplicates}</strong><span>{t('lessonPlan:import.skipped')}</span></div>
                        </div>
                        <IssueTable title={t('lessonPlan:import.errorsTitle')} items={result.errors} t={t} />
                        <IssueTable title={t('lessonPlan:import.warningsTitle')} items={result.warnings} t={t} />
                    </>
                )}

                <div className="lp-import-footer">
                    {(result?.errors?.length > 0 || result?.warnings?.length > 0) && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={handleErrorReport}>
                            {t('lessonPlan:import.downloadErrors')}
                        </button>
                    )}
                    <button type="button" className="btn btn-ghost" onClick={onClose}>{t('lessonPlan:import.close')}</button>
                    <button
                        type="button"
                        className="btn btn-primary"
                        disabled={!summary?.validRows || committing}
                        onClick={handleCommit}
                    >
                        {committing
                            ? t('lessonPlan:import.importing')
                            : t('lessonPlan:import.importNow', { count: summary?.validRows || 0 })}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ImportLessonPlansModal;
