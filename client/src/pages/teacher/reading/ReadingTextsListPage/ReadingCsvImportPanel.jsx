import { useRef, useState } from 'react';
import { Menu, MenuItem } from '@mui/material';
import {
  HiOutlineChevronDown,
  HiOutlineDotsVertical,
  HiOutlineInformationCircle,
  HiOutlineUpload,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import readingService from '../../../../services/readingService.js';
import { buildReadingCsvTemplate, parseReadingCsv } from './readingCsvImport.js';

export default function ReadingCsvImportPanel({ onImported }) {
  const { t } = useTranslation(['reading']);
  const inputRef = useRef(null);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [reading, setReading] = useState(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [isShared, setIsShared] = useState(false);

  const closeMenu = () => setMenuAnchor(null);

  const downloadTemplate = () => {
    const blob = new Blob([buildReadingCsvTemplate()], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'reading-lesson-template.csv';
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
      const parsed = parseReadingCsv(await file.text());
      setReading(parsed);
      setIsShared(parsed.isShared);
    } catch (parseError) {
      setError(parseError.message || 'Could not read this CSV file.');
    }
  };

  const handleImport = async () => {
    if (!reading || importing) return;
    setImporting(true);
    setError('');
    try {
      await readingService.importCsv({ ...reading, isShared });
      toast.success(t('reading:texts.importSuccess'));
      setReading(null);
      setFileName('');
      if (inputRef.current) inputRef.current.value = '';
      onImported();
    } catch (requestError) {
      setError(requestError.response?.data?.message || t('reading:texts.importFailed'));
    } finally {
      setImporting(false);
    }
  };

  return (
    <section className="reading-import" aria-labelledby="reading-import-title">
      <div className="reading-import-intro">
        <span className="reading-import-icon" aria-hidden="true">
          <HiOutlineUpload size={15} />
        </span>
        <h2 id="reading-import-title">{t('reading:texts.importTitle')}</h2>
      </div>
      <div className="reading-import-actions">
        <label className="btn btn-secondary btn-sm reading-csv-file-label">
          <HiOutlineUpload size={15} aria-hidden="true" />
          {t('reading:texts.chooseCsv')}
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFile}
            aria-label={t('reading:texts.chooseCsvAriaLabel')}
          />
        </label>
        {fileName && <span className="reading-csv-file-name">{fileName}</span>}
        <button
          type="button"
          className="reading-kebab"
          aria-label={t('reading:texts.importMenuAria')}
          aria-haspopup="menu"
          aria-expanded={Boolean(menuAnchor)}
          onClick={(event) => setMenuAnchor(event.currentTarget)}
        >
          <HiOutlineDotsVertical size={18} />
        </button>
        <Menu
          open={Boolean(menuAnchor)}
          anchorEl={menuAnchor}
          onClose={closeMenu}
          slotProps={{ paper: { className: 'reading-row-menu' } }}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          <MenuItem
            onClick={() => {
              closeMenu();
              downloadTemplate();
            }}
          >
            {t('reading:texts.downloadCsvTemplate')}
          </MenuItem>
          <MenuItem
            onClick={() => {
              closeMenu();
              setHelpOpen(true);
            }}
          >
            {t('reading:texts.importHelpSummary')}
          </MenuItem>
        </Menu>
      </div>
      {error && <p className="reading-csv-error" role="alert">{error}</p>}
      {reading && (
        <div className="reading-csv-preview">
          <div className="reading-csv-preview-title">
            <strong>{reading.title}</strong>
            <span>
              {t('reading:texts.questionCount', { total: reading.questions.length })}
              {' · '}
              {reading.subjectArea || t('reading:texts.noSubjectSpecified')}
              {reading.sections.length > 0
                && ` · ${t('reading:texts.sectionCount', { total: reading.sections.length })}`}
            </span>
          </div>
          <label>
            <input type="checkbox" checked={isShared} onChange={(event) => setIsShared(event.target.checked)} />
            {t('reading:texts.shareWithSchool')}
          </label>
          <button type="button" className="btn btn-primary btn-sm" onClick={handleImport} disabled={importing}>
            {importing ? t('reading:texts.importing') : t('reading:texts.importReading')}
          </button>
        </div>
      )}
      <details
        className="reading-import-help"
        open={helpOpen}
        onToggle={(event) => setHelpOpen(event.currentTarget.open)}
      >
        <summary>
          <HiOutlineInformationCircle size={14} aria-hidden="true" />
          {t('reading:texts.importHelpSummary')}
          <HiOutlineChevronDown size={13} className="reading-help-caret" aria-hidden="true" />
        </summary>
        <p>{t('reading:texts.importDescription')}</p>
        <p>{t('reading:texts.csvHelp')}</p>
      </details>
    </section>
  );
}
