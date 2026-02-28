import { useCallback, useEffect, useMemo, useState } from 'react';

const useReportAnalytics = ({ token, user }) => {
  const [period, setPeriod] = useState('monthly');
  const [year, setYear] = useState(new Date().getFullYear());
  const [userUsage, setUserUsage] = useState(null);
  const [schoolUsage, setSchoolUsage] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const userResponse = await fetch(
        `/api/reports/token-usage?period=${period}&year=${year}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const userData = await userResponse.json();
      if (userData.success) {
        setUserUsage(userData.data);
      }

      if (user?.role === 'admin') {
        const schoolResponse = await fetch(
          `/api/reports/token-usage/school/${user.school}?period=${period}&year=${year}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const schoolData = await schoolResponse.json();
        if (schoolData.success) {
          setSchoolUsage(schoolData.data);
        }
      } else {
        setSchoolUsage(null);
      }
    } catch (err) {
      console.error('Error fetching analytics:', err);
    } finally {
      setLoading(false);
    }
  }, [period, token, user?.role, user?.school, year]);

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