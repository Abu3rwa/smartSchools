
import { useTranslation } from 'react-i18next';
import { EngagementChart, PerformanceChart } from '../../../components/analytics/Charts';

const SuperAdminAnalyticsPage = () => {
  const { t } = useTranslation(['superAdminAnalytics']);

  const engagementData = [
    { name: t('superAdminAnalytics:engagement.week', { week: 1 }), uv: 4000, pv: 2400, amt: 2400 },
    { name: t('superAdminAnalytics:engagement.week', { week: 2 }), uv: 3000, pv: 1398, amt: 2210 },
    { name: t('superAdminAnalytics:engagement.week', { week: 3 }), uv: 2000, pv: 9800, amt: 2290 },
    { name: t('superAdminAnalytics:engagement.week', { week: 4 }), uv: 2780, pv: 3908, amt: 2000 },
  ];

  const performanceData = {
    labels: [
      t('superAdminAnalytics:months.january'),
      t('superAdminAnalytics:months.february'),
      t('superAdminAnalytics:months.march'),
      t('superAdminAnalytics:months.april'),
      t('superAdminAnalytics:months.may'),
      t('superAdminAnalytics:months.june'),
      t('superAdminAnalytics:months.july'),
    ],
    datasets: [
      {
        label: t('superAdminAnalytics:charts.studentPerformance'),
        data: [65, 59, 80, 81, 56, 55, 40],
        fill: false,
        borderColor: 'rgb(75, 192, 192)',
        tension: 0.1,
      },
    ],
  };

  return (
    <div>
      <h1>{t('superAdminAnalytics:page.title')}</h1>
      <div style={{ marginBottom: '2rem' }}>
        <h2>{t('superAdminAnalytics:sections.engagementMetrics')}</h2>
        <EngagementChart data={engagementData} />
      </div>
      <div>
        <h2>{t('superAdminAnalytics:sections.performanceMetrics')}</h2>
        <PerformanceChart data={performanceData} />
      </div>
    </div>
  );
};

export default SuperAdminAnalyticsPage;
