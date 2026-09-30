export const getMapPracticeImportAction = ({ phase, retryAction = null, files = [], errorMode = 'stop', token = null }) => {
  if (phase === 'previewing') return { disabled: true, reasonKey: 'checking' };
  if (phase === 'error' && retryAction !== 'commit') return { disabled: true, reasonKey: 'previewRequired' };
  if (phase === 'importing') return { disabled: true, reasonKey: 'importing' };

  const needsStudent = files.filter((file) => file.status === 'needs_student').length;
  if (needsStudent > 0) return { disabled: true, reasonKey: 'chooseStudentReason', values: { count: needsStudent } };

  if (files.some((file) => file.status === 'has_errors' && !file.rows)) return { disabled: true, reasonKey: 'invalidFile' };

  const errorCount = files.reduce((total, file) => total + (file.errors?.length || 0), 0);
  if (errorCount > 0 && errorMode === 'stop') return { disabled: true, reasonKey: 'fixErrorsReason', values: { count: errorCount } };
  if (!token || !files.length) return { disabled: true, reasonKey: 'previewRequired' };

  return { disabled: false, reasonKey: null };
};