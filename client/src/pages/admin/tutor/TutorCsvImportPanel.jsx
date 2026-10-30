import { useRef, useState } from 'react';
import {
  HiOutlineChevronDown,
  HiOutlineDownload,
  HiOutlineInformationCircle,
  HiOutlineUpload
} from 'react-icons/hi';
import { useTranslation } from 'react-i18next';
import { buildTutorCsvTemplate, parseTutorCsv } from './tutorCsvImport.js';

export default function TutorCsvImportPanel({
  grade,
  subject,
  standards = [],
  importing = false,
  onImport
}) {
  const { t } = useTranslation(['tutor']);
  const inputRef = useRef(null);
  const [reading, setReading] = useState(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const ready = Boolean(grade && subject?.id);
  const blockedText = !grade
    ? t('tutor:admin.import.pickGradeFirst')
    : t('tutor:admin.import.pickSubjectFirst');

  const downloadTemplate = () => {
    const blob = new Blob([buildTutorCsvTemplate()], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'tutor-lessons-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    setReading(null);
    setError('');
    setFileName(file?.name || '');
    if (!file) return;
    try {
      setReading(parseTutorCsv(await file.text()));
    } catch (parseError) {
      setError(parseError.message || t('tutor:admin.import.readFailed'));
    }
  };

  const handleImport = async () => {
    if (!reading || busy || importing) return;
    setBusy(true);
    setError('');
    try {
      await onImport({ lessons: reading.lessons, source: fileName });
      setReading(null);
      setFileName('');
      if (inputRef.current) inputRef.current.value = '';
    } catch (requestError) {
      setError(requestError.response?.data?.message || t('tutor:admin.import.importFailed'));
    } finally {
      setBusy(false);
    }
  };

  const working = busy || importing;

  return (
    <section className="ta-import" aria-labelledby="ta-import-title">
      <div className="ta-import-intro">
        <span className="ta-import-icon" aria-hidden="true"><HiOutlineUpload size={20} /></span>
        <div>
          <h3 id="ta-import-title">{t('tutor:admin.import.title')}</h3>
          <p>{t('tutor:admin.import.description')}</p>
        </div>
      </div>

      <div className="ta-import-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={downloadTemplate}>
          <HiOutlineDownload size={16} aria-hidden="true" />
          {t('tutor:admin.import.downloadTemplate')}
        </button>
        <label className={`btn btn-secondary btn-sm ta-file-label${ready ? '' : ' is-disabled'}`}>
          <HiOutlineUpload size={16} aria-hidden="true" />
          {t('tutor:admin.import.chooseCsv')}
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFile}
            disabled={!ready}
            aria-label={t('tutor:admin.import.chooseCsvAriaLabel')}
          />
        </label>
        {fileName && <span className="ta-file-name">{fileName}</span>}
      </div>

      {!ready && <p className="ta-hint">{blockedText}</p>}

      <ul className="ta-rules">
        <li>{t('tutor:admin.import.rules.repeat')}</li>
        <li>{t('tutor:admin.import.rules.quote')}</li>
        <li>{t('tutor:admin.import.rules.limits')}</li>
        <li>{t('tutor:admin.import.rules.standards')}</li>
        {standards.length > 0 && (
          <li>{t('tutor:admin.import.rules.knownStandards', {
            codes: standards.slice(0, 8).map((row) => row.code).join(', ')
          })}</li>
        )}
      </ul>

      {error && <p className="ta-error" role="alert">{error}</p>}

      {reading && (
        <div className="ta-preview">
          <div>
            <strong>{t('tutor:admin.import.preview', { n: reading.lessons.length, u: reading.units })}</strong>
            <span>{reading.lessons[0]?.title}</span>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleImport}
            disabled={working}
          >
            {working ? t('tutor:admin.import.importing') : t('tutor:admin.import.importNow')}
          </button>
        </div>
      )}

      <details className="ta-import-help">
        <summary>
          <HiOutlineInformationCircle size={15} aria-hidden="true" />
          {t('tutor:admin.import.helpSummary')}
          <HiOutlineChevronDown size={14} aria-hidden="true" />
        </summary>
        <p>{t('tutor:admin.import.helpBody')}</p>
      </details>
    </section>
  );
}
