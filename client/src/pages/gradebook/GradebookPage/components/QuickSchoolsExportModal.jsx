import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import quickSchoolsExportService from '../../../../services/quickSchoolsExportService';
import gradebookConfigService from '../../../../services/gradebookConfigService';
import {
    buildDefaultProfile,
    buildExportRequest,
    filenameFromDisposition,
    semesterNameFor,
    toDateInput
} from '../utils/quickSchoolsExport';
import './QuickSchoolsExportModal.css';

const PREVIEW_LIMIT = 40;

const errorMessage = (error, fallback) =>
    error?.response?.data?.message || error?.message || fallback;

const profileToForm = (saved) => ({
    name: saved.name || '',
    subjectValue: saved.subjectValue || '',
    gradeLevel: saved.gradeLevel || '',
    semester: saved.semester === 1 || saved.semester === 2 ? saved.semester : null,
    semesterName: saved.semesterName || '',
    columns: (saved.columns || []).map((column) => ({
        sourceType: column.sourceType,
        enabled: column.enabled !== false,
        columnName: column.columnName || '',
        category: column.category || '',
        totalMarks: column.totalMarks ?? 10,
        dateRule: column.dateRule === 'latest' ? 'latest' : 'fixed',
        fixedDate: column.fixedDate ? toDateInput(column.fixedDate) : ''
    })),
    nameSource: saved.nameSource === 'fullName' ? 'fullName' : 'externalName',
    skipEmpty: saved.skipEmpty !== false,
    roundTo: saved.roundTo ?? 2
});

const QuickSchoolsExportModal = ({
    open,
    onClose,
    classId,
    className = '',
    classGrade = null,
    academicYear,
    subjectId,
    subjectName = '',
    subjectCode = '',
    selectedSemester = null,
    categoryMaxMarks = null,
    grades = []
}) => {
    const { t } = useTranslation(['gradebook']);
    const [config, setConfig] = useState({ categories: [], semesters: [] });
    const [profiles, setProfiles] = useState([]);
    const [selectedProfileId, setSelectedProfileId] = useState('');
    const [profile, setProfile] = useState(null);
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [preview, setPreview] = useState(null);
    const [formError, setFormError] = useState('');
    const [busy, setBusy] = useState({ loading: false, saving: false, previewing: false, downloading: false });

    const buildFallbackProfile = (categories, semesters) => buildDefaultProfile({
        className,
        subjectName,
        subjectCode,
        classGrade,
        academicYear,
        semester: selectedSemester,
        semesters,
        categories,
        categoryMaxMarks,
        grades
    });

    useEffect(() => {
        if (!open || !classId || !subjectId) return undefined;
        let cancelled = false;

        setBusy((current) => ({ ...current, loading: true }));
        setFormError('');
        setPreview(null);

        Promise.all([
            gradebookConfigService.getConfig(academicYear),
            quickSchoolsExportService.listProfiles({ classId, subjectId })
        ])
            .then(([configResponse, profileResponse]) => {
                if (cancelled) return;
                const nextConfig = {
                    categories: configResponse?.data?.categories || [],
                    semesters: configResponse?.data?.semesters || []
                };
                const savedProfiles = profileResponse?.data || [];
                setConfig(nextConfig);
                setProfiles(savedProfiles);

                const first = savedProfiles[0];
                if (first) {
                    setSelectedProfileId(first._id);
                    setProfile(profileToForm(first));
                } else {
                    setSelectedProfileId('');
                    setProfile(buildFallbackProfile(nextConfig.categories, nextConfig.semesters));
                }
            })
            .catch((error) => {
                if (cancelled) return;
                setConfig({ categories: [], semesters: [] });
                setProfiles([]);
                setSelectedProfileId('');
                setProfile(buildFallbackProfile([], []));
                setFormError(errorMessage(error, t('gradebook:quickSchools.loadFailed')));
            })
            .finally(() => {
                if (!cancelled) setBusy((current) => ({ ...current, loading: false }));
            });

        return () => {
            cancelled = true;
        };
        // Load once per open and per class/subject: grades refreshing underneath
        // must not wipe edits the teacher has already made in the dialog.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, classId, subjectId, academicYear, t]);

    if (!open || !profile) return null;

    const updateProfile = (patch) => {
        setProfile((current) => ({ ...current, ...patch }));
        setPreview(null);
    };

    const updateColumn = (index, patch) => {
        setProfile((current) => ({
            ...current,
            columns: current.columns.map((column, columnIndex) => (
                columnIndex === index ? { ...column, ...patch } : column
            ))
        }));
        setPreview(null);
    };

    const handleProfileSelect = (value) => {
        setSelectedProfileId(value);
        setPreview(null);
        setFormError('');
        if (!value) {
            setProfile(buildFallbackProfile(config.categories, config.semesters));
            return;
        }
        const saved = profiles.find((item) => String(item._id) === String(value));
        if (saved) setProfile(profileToForm(saved));
    };

    const handleSemesterChange = (value) => {
        const semester = value ? Number(value) : null;
        updateProfile({
            semester,
            semesterName: semesterNameFor(academicYear, semester, config.semesters)
        });
    };

    const semesterOptions = config.semesters.length
        ? config.semesters.map((semester) => ({
            value: String(semester.number),
            label: semester.label || `${t('gradebook:quickSchools.semester')} ${semester.number}`
        }))
        : [
            { value: '1', label: 'Semester 1' },
            { value: '2', label: 'Semester 2' }
        ];

    const profilePayload = () => ({
        name: profile.name,
        classId,
        subjectId,
        academicYear,
        semester: profile.semester,
        subjectValue: profile.subjectValue,
        gradeLevel: profile.gradeLevel,
        semesterName: profile.semesterName,
        columns: profile.columns,
        nameSource: profile.nameSource,
        skipEmpty: profile.skipEmpty,
        roundTo: profile.roundTo
    });

    const handleSave = async () => {
        if (!profile.name.trim()) {
            setFormError(t('gradebook:quickSchools.profileNameRequired'));
            return;
        }
        setBusy((current) => ({ ...current, saving: true }));
        setFormError('');
        try {
            const result = selectedProfileId
                ? await quickSchoolsExportService.updateProfile(selectedProfileId, profilePayload())
                : await quickSchoolsExportService.createProfile(profilePayload());
            const saved = result?.data;
            if (saved) {
                setProfiles((current) => {
                    const others = current.filter((item) => String(item._id) !== String(saved._id));
                    return [saved, ...others];
                });
                setSelectedProfileId(saved._id);
            }
            toast.success(t('gradebook:quickSchools.saved'));
        } catch (error) {
            setFormError(errorMessage(error, t('gradebook:quickSchools.saveFailed')));
        } finally {
            setBusy((current) => ({ ...current, saving: false }));
        }
    };

    const handleDelete = async () => {
        if (!selectedProfileId) return;
        if (!window.confirm(t('gradebook:quickSchools.confirmDelete'))) return;
        setBusy((current) => ({ ...current, saving: true }));
        try {
            await quickSchoolsExportService.deleteProfile(selectedProfileId);
            setProfiles((current) => current.filter((item) => String(item._id) !== String(selectedProfileId)));
            setSelectedProfileId('');
            setProfile(buildFallbackProfile(config.categories, config.semesters));
            setPreview(null);
            toast.success(t('gradebook:quickSchools.deleted'));
        } catch (error) {
            setFormError(errorMessage(error, t('gradebook:quickSchools.deleteFailed')));
        } finally {
            setBusy((current) => ({ ...current, saving: false }));
        }
    };

    const exportRequest = () => buildExportRequest({
        profile,
        classId,
        subjectId,
        academicYear,
        dateFrom,
        dateTo
    });

    const handlePreview = async () => {
        setBusy((current) => ({ ...current, previewing: true }));
        setFormError('');
        try {
            const result = await quickSchoolsExportService.preview(exportRequest());
            setPreview(result?.data || null);
        } catch (error) {
            setPreview(null);
            setFormError(errorMessage(error, t('gradebook:quickSchools.previewFailed')));
        } finally {
            setBusy((current) => ({ ...current, previewing: false }));
        }
    };

    const handleDownload = async () => {
        setBusy((current) => ({ ...current, downloading: true }));
        setFormError('');
        try {
            // Downloading without a preview still validates first: the file must
            // never be built from values the teacher has not seen.
            let current = preview;
            if (!current) {
                const result = await quickSchoolsExportService.preview(exportRequest());
                current = result?.data || null;
                setPreview(current);
            }
            if (current?.errors?.length) {
                setFormError(t('gradebook:quickSchools.fixErrorsFirst'));
                return;
            }
            const warningCount = (current?.warnings || []).filter((item) => item.level === 'warning').length;
            if (warningCount && !window.confirm(t('gradebook:quickSchools.confirmWarnings'))) return;

            const response = await quickSchoolsExportService.download(exportRequest());
            const fileName = filenameFromDisposition(response?.headers?.['content-disposition'])
                || 'gradebook_import.xlsx';
            const blob = new Blob([response.data], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            toast.success(t('gradebook:quickSchools.downloaded'));
        } catch (error) {
            let message = errorMessage(error, t('gradebook:quickSchools.downloadFailed'));
            const data = error?.response?.data;
            if (data instanceof Blob) {
                try {
                    const parsed = JSON.parse(await data.text());
                    message = parsed?.message || message;
                } catch {
                    // keep the fallback message
                }
            }
            setFormError(message);
        } finally {
            setBusy((current) => ({ ...current, downloading: false }));
        }
    };

    const hasPreviewErrors = Boolean(preview?.errors?.length);
    const previewRows = (preview?.rows || []).slice(0, PREVIEW_LIMIT);

    return (
        <div className="qs-export-overlay" role="presentation" onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
        }}>
            <div className="qs-export-modal" role="dialog" aria-modal="true" aria-label={t('gradebook:quickSchools.title')}>
                <header className="qs-export-header">
                    <div>
                        <span className="qs-export-eyebrow">{t('gradebook:quickSchools.eyebrow')}</span>
                        <h2>{t('gradebook:quickSchools.title')}</h2>
                        <p>{t('gradebook:quickSchools.subtitle')}</p>
                    </div>
                    <button type="button" className="qs-export-close" onClick={onClose} aria-label={t('gradebook:quickSchools.close')}>
                        ×
                    </button>
                </header>

                <div className="qs-export-body">
                    {busy.loading && <p className="qs-export-muted">{t('gradebook:quickSchools.loading')}</p>}

                    <section className="qs-export-section">
                        <div className="qs-export-grid qs-export-grid--profile">
                            <label>
                                <span>{t('gradebook:quickSchools.profile')}</span>
                                <select value={selectedProfileId} onChange={(event) => handleProfileSelect(event.target.value)}>
                                    <option value="">{t('gradebook:quickSchools.newProfile')}</option>
                                    {profiles.map((item) => (
                                        <option key={item._id} value={item._id}>{item.name}</option>
                                    ))}
                                </select>
                            </label>
                            <label>
                                <span>{t('gradebook:quickSchools.profileName')}</span>
                                <input
                                    type="text"
                                    value={profile.name}
                                    onChange={(event) => updateProfile({ name: event.target.value })}
                                />
                            </label>
                        </div>
                    </section>

                    <section className="qs-export-section">
                        <h3>{t('gradebook:quickSchools.settings')}</h3>
                        <div className="qs-export-grid">
                            <label>
                                <span>{t('gradebook:quickSchools.subjectValue')}</span>
                                <input
                                    type="text"
                                    value={profile.subjectValue}
                                    onChange={(event) => updateProfile({ subjectValue: event.target.value })}
                                />
                                <small>{t('gradebook:quickSchools.subjectHint')}</small>
                            </label>
                            <label>
                                <span>{t('gradebook:quickSchools.gradeLevel')}</span>
                                <input
                                    type="text"
                                    value={profile.gradeLevel}
                                    onChange={(event) => updateProfile({ gradeLevel: event.target.value })}
                                />
                            </label>
                            <label>
                                <span>{t('gradebook:quickSchools.semester')}</span>
                                <select
                                    value={profile.semester ? String(profile.semester) : ''}
                                    onChange={(event) => handleSemesterChange(event.target.value)}
                                >
                                    <option value="">{t('gradebook:quickSchools.wholeYear')}</option>
                                    {semesterOptions.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </label>
                            <label>
                                <span>{t('gradebook:quickSchools.semesterName')}</span>
                                <input
                                    type="text"
                                    value={profile.semesterName}
                                    onChange={(event) => updateProfile({ semesterName: event.target.value })}
                                />
                            </label>
                        </div>
                    </section>

                    <section className="qs-export-section">
                        <h3>{t('gradebook:quickSchools.columns')}</h3>
                        <p className="qs-export-muted">{t('gradebook:quickSchools.columnsHint')}</p>
                        <div className="qs-export-columns">
                            <table>
                                <thead>
                                    <tr>
                                        <th aria-label={t('gradebook:quickSchools.include')} />
                                        <th>{t('gradebook:quickSchools.appCategory')}</th>
                                        <th>{t('gradebook:quickSchools.columnName')}</th>
                                        <th>{t('gradebook:quickSchools.quickSchoolsCategory')}</th>
                                        <th>{t('gradebook:quickSchools.totalMarks')}</th>
                                        <th>{t('gradebook:quickSchools.dateRule')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {profile.columns.map((column, index) => (
                                        <tr key={column.sourceType}>
                                            <td>
                                                <input
                                                    type="checkbox"
                                                    checked={column.enabled}
                                                    onChange={(event) => updateColumn(index, { enabled: event.target.checked })}
                                                    aria-label={column.sourceType}
                                                />
                                            </td>
                                            <td className="qs-export-app-category">{column.sourceType.replace(/_/g, ' ')}</td>
                                            <td>
                                                <input
                                                    type="text"
                                                    value={column.columnName}
                                                    onChange={(event) => updateColumn(index, { columnName: event.target.value })}
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="text"
                                                    value={column.category}
                                                    onChange={(event) => updateColumn(index, { category: event.target.value })}
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    value={column.totalMarks}
                                                    onChange={(event) => updateColumn(index, { totalMarks: event.target.value })}
                                                />
                                            </td>
                                            <td>
                                                <div className="qs-export-date-rule">
                                                    <select
                                                        value={column.dateRule}
                                                        onChange={(event) => updateColumn(index, { dateRule: event.target.value })}
                                                    >
                                                        <option value="fixed">{t('gradebook:quickSchools.fixed')}</option>
                                                        <option value="latest">{t('gradebook:quickSchools.latest')}</option>
                                                    </select>
                                                    {column.dateRule === 'fixed' && (
                                                        <input
                                                            type="date"
                                                            value={column.fixedDate || ''}
                                                            onChange={(event) => updateColumn(index, { fixedDate: event.target.value })}
                                                        />
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section className="qs-export-section">
                        <h3>{t('gradebook:quickSchools.filters')}</h3>
                        <div className="qs-export-grid">
                            <label>
                                <span>{t('gradebook:quickSchools.dateFrom')}</span>
                                <input
                                    type="date"
                                    value={dateFrom}
                                    onChange={(event) => { setDateFrom(event.target.value); setPreview(null); }}
                                />
                            </label>
                            <label>
                                <span>{t('gradebook:quickSchools.dateTo')}</span>
                                <input
                                    type="date"
                                    value={dateTo}
                                    onChange={(event) => { setDateTo(event.target.value); setPreview(null); }}
                                />
                            </label>
                            <label>
                                <span>{t('gradebook:quickSchools.nameSource')}</span>
                                <select
                                    value={profile.nameSource}
                                    onChange={(event) => updateProfile({ nameSource: event.target.value })}
                                >
                                    <option value="externalName">{t('gradebook:quickSchools.nameSourceExternal')}</option>
                                    <option value="fullName">{t('gradebook:quickSchools.nameSourceApp')}</option>
                                </select>
                            </label>
                            <label>
                                <span>{t('gradebook:quickSchools.roundTo')}</span>
                                <select
                                    value={String(profile.roundTo)}
                                    onChange={(event) => updateProfile({ roundTo: Number(event.target.value) })}
                                >
                                    <option value="0">0</option>
                                    <option value="1">1</option>
                                    <option value="2">2</option>
                                </select>
                            </label>
                        </div>
                        <label className="qs-export-checkbox">
                            <input
                                type="checkbox"
                                checked={profile.skipEmpty}
                                onChange={(event) => updateProfile({ skipEmpty: event.target.checked })}
                            />
                            <span>{t('gradebook:quickSchools.skipEmpty')}</span>
                        </label>
                    </section>

                    {formError && <p className="qs-export-alert is-error">{formError}</p>}

                    <section className="qs-export-section">
                        <div className="qs-export-preview-head">
                            <h3>{t('gradebook:quickSchools.preview')}</h3>
                            {preview && (
                                <span className="qs-export-muted">
                                    {t('gradebook:quickSchools.previewStudents', { total: preview.meta?.studentCount ?? 0 })}
                                    {' · '}
                                    {t('gradebook:quickSchools.previewRows', { total: preview.meta?.rowCount ?? 0 })}
                                </span>
                            )}
                        </div>

                        {!preview && <p className="qs-export-muted">{t('gradebook:quickSchools.previewEmpty')}</p>}

                        {preview && (
                            <>
                                {preview.errors?.length > 0 && (
                                    <div className="qs-export-alert is-error">
                                        <strong>{t('gradebook:quickSchools.errors')}</strong>
                                        <ul>
                                            {preview.errors.map((item, index) => (
                                                <li key={`error-${index}`}>{item.message}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                {preview.warnings?.length > 0 && (
                                    <div className="qs-export-alert is-warning">
                                        <strong>{t('gradebook:quickSchools.warnings')}</strong>
                                        <ul>
                                            {preview.warnings.map((item, index) => (
                                                <li key={`warning-${index}`}>{item.message}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {previewRows.length > 0 && (
                                    <div className="qs-export-preview-table">
                                        <table>
                                            <thead>
                                                <tr>
                                                    <th>{t('gradebook:quickSchools.rowStudent')}</th>
                                                    <th>{t('gradebook:quickSchools.rowColumn')}</th>
                                                    <th>{t('gradebook:quickSchools.rowDate')}</th>
                                                    <th>{t('gradebook:quickSchools.rowCategory')}</th>
                                                    <th>{t('gradebook:quickSchools.rowMarks')}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {previewRows.map((row, index) => (
                                                    <tr key={`row-${index}`}>
                                                        <td>{row.studentFullName}</td>
                                                        <td>{row.columnName}</td>
                                                        <td>{row.date ? new Date(row.date).toLocaleDateString() : ''}</td>
                                                        <td>{row.category}</td>
                                                        <td>{`${row.marks} / ${row.totalMarks}`}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        {preview.rows.length > previewRows.length && (
                                            <p className="qs-export-muted">
                                                {t('gradebook:quickSchools.previewTruncated', {
                                                    shown: previewRows.length,
                                                    total: preview.rows.length
                                                })}
                                            </p>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </section>
                </div>

                <footer className="qs-export-footer">
                    <div className="qs-export-footer-left">
                        <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={handleSave}
                            disabled={busy.saving || busy.loading}
                        >
                            {busy.saving ? t('gradebook:quickSchools.saving') : t('gradebook:quickSchools.save')}
                        </button>
                        {selectedProfileId && (
                            <button
                                type="button"
                                className="btn btn-outline btn-sm qs-export-danger"
                                onClick={handleDelete}
                                disabled={busy.saving}
                            >
                                {t('gradebook:quickSchools.delete')}
                            </button>
                        )}
                    </div>
                    <div className="qs-export-footer-right">
                        <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={handlePreview}
                            disabled={busy.previewing || busy.loading}
                        >
                            {busy.previewing ? t('gradebook:quickSchools.previewing') : t('gradebook:quickSchools.preview')}
                        </button>
                        <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={handleDownload}
                            disabled={busy.downloading || busy.loading || hasPreviewErrors}
                            title={hasPreviewErrors ? t('gradebook:quickSchools.fixErrorsFirst') : undefined}
                        >
                            {busy.downloading ? t('gradebook:quickSchools.downloading') : t('gradebook:quickSchools.download')}
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );
};

export default QuickSchoolsExportModal;
