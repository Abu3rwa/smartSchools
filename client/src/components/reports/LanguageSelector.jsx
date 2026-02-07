import React from 'react';
import './ReportComponents.css';

const languages = [
  { value: 'english', label: 'English', icon: '🇺🇸', rtl: false },
  { value: 'arabic', label: 'العربية', icon: '🇸🇦', rtl: true },
  { value: 'bilingual', label: 'Bilingual', icon: '🌐', rtl: false }
];

const LanguageSelector = ({ value, onChange, showLabel = true }) => {
  return (
    <div className="language-selector">
      {showLabel && <label className="selector-label">Report Language</label>}
      <div className="language-options">
        {languages.map((lang) => (
          <button
            key={lang.value}
            type="button"
            className={`language-option ${value === lang.value ? 'active' : ''} ${lang.rtl ? 'arabic' : ''}`}
            onClick={() => onChange(lang.value)}
          >
            <span className="language-icon">{lang.icon}</span>
            <span className={`language-label ${lang.rtl ? 'rtl' : ''}`}>{lang.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default LanguageSelector;
