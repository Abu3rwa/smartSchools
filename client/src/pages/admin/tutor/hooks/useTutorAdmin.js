import { useEffect, useState } from 'react';
import tutorService from '../../../../services/tutorService.js';

const unwrap = (response) => response?.data?.data;

export const useTutorAdmin = () => {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [retryKey, setRetryKey] = useState(0);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    tutorService.overview()
      .then((response) => { if (active) setOverview(unwrap(response) || null); })
      .catch(() => { if (active) setOverview(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retryKey]);

  const saveSettings = async (patch) => {
    setSavingSettings(true);
    try {
      const settings = unwrap(await tutorService.saveSettings(patch));
      setOverview((current) => (current ? { ...current, settings } : current));
      return settings;
    } finally {
      setSavingSettings(false);
    }
  };

  const setClassStatus = async (classId, status) => {
    const row = unwrap(await tutorService.setClassAccess(classId, { status }));
    setOverview((current) => (current ? {
      ...current,
      classes: current.classes.map((entry) => (
        entry.id === classId ? { ...entry, status: row.status, note: row.note } : entry
      ))
    } : current));
    return row;
  };

  return {
    overview,
    loading,
    reload: () => setRetryKey((current) => current + 1),
    savingSettings,
    saveSettings,
    setClassStatus
  };
};
