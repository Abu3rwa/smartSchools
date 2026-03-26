import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../../../config/api';

const useReportAnalytics = ({ user }) => {
  const [period, setPeriod] = useState('monthly');
  const [year, setYear] = useState(new Date().getFullYear());
  const [userUsage, setUserUsage] = useState(null);
  const [schoolUsage, setSchoolUsage] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const userResponse = await api.get('/reports/token-usage', {
        params: { period, year }
      });
      if (userResponse.data.success) {
        setUserUsage(userResponse.data.data);
      }

      if (user?.role === 'admin') {
        const schoolResponse = await api.get(`/reports/token-usage/school/${user.school}`, {
          params: { period, year }
        });
        if (schoolResponse.data.success) {
          setSchoolUsage(schoolResponse.data.data);
        }
      } else {
        setSchoolUsage(null);
      }
    } catch (err) {
      console.error('Error fetching analytics:', err);
    } finally {
      setLoading(false);
    }
  }, [period, user?.role, user?.school, year]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const calculatePercentage = useCallback((value, total) => {
    if (!total || total === 0) return 0;
    return Number(((value / total) * 100).toFixed(1));
  }, []);

  const formatNumber = useCallback((num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num?.toString() || '0';
  }, []);

  const formatCurrency = useCallback((num) => {
    return '$' + (num || 0).toFixed(4);
  }, []);

  const userSummary = useMemo(() => userUsage?.summary || {}, [userUsage]);

  return {
    period,
    setPeriod,
    year,
    setYear,
    userUsage,
    schoolUsage,
    userSummary,
    loading,
    fetchAnalytics,
    calculatePercentage,
    formatNumber,
    formatCurrency
  };
};

export default useReportAnalytics;