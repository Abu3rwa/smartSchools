
import React from 'react';
import { EngagementChart, PerformanceChart } from '../../components/analytics/Charts';

const AdminAnalyticsPage = () => {
  const engagementData = [
    { name: 'Week 1', uv: 4000, pv: 2400, amt: 2400 },
    { name: 'Week 2', uv: 3000, pv: 1398, amt: 2210 },
    { name: 'Week 3', uv: 2000, pv: 9800, amt: 2290 },
    { name: 'Week 4', uv: 2780, pv: 3908, amt: 2000 },
  ];

  const performanceData = {
    labels: ['January', 'February', 'March', 'April', 'May', 'June', 'July'],
    datasets: [
      {
        label: 'Student Performance',
        data: [65, 59, 80, 81, 56, 55, 40],
        fill: false,
        borderColor: 'rgb(75, 192, 192)',
        tension: 0.1,
      },
    ],
  };

  return (
    <div>
      <h1>Admin Analytics</h1>
      <div style={{ marginBottom: '2rem' }}>
        <h2>Engagement Metrics</h2>
        <EngagementChart data={engagementData} />
      </div>
      <div>
        <h2>Performance Metrics</h2>
        <PerformanceChart data={performanceData} />
      </div>
    </div>
  );
};

export default AdminAnalyticsPage;
