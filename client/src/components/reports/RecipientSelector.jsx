import React from 'react';
import './ReportComponents.css';

const RecipientSelector = ({ value = {}, onChange, showLabel = true }) => {
  const recipients = [
    { key: 'mother', label: 'Mother', icon: '👩' },
    { key: 'father', label: 'Father', icon: '👨' },
    { key: 'student', label: 'Student', icon: '👨‍🎓' },
    { key: 'teacher', label: 'Teacher (CC)', icon: '👩‍🏫' }
  ];

  const handleChange = (key, checked) => {
    onChange({
      ...value,
      [key]: checked
    });
  };

  return (
    <div className="recipient-selector">
      {showLabel && <label className="selector-label">Email Recipients</label>}
      <div className="recipient-options">
        {recipients.map((recipient) => (
          <label key={recipient.key} className="recipient-option">
            <input
              type="checkbox"
              checked={value[recipient.key] || false}
              onChange={(e) => handleChange(recipient.key, e.target.checked)}
            />
            <span style={{ marginRight: '4px' }}>{recipient.icon}</span>
            <span className="recipient-label">{recipient.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
};

export default RecipientSelector;
