import React from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

export const EngagementChart = ({ data }) => {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Bar dataKey="uv" fill="#8884d8" />
        <Bar dataKey="pv" fill="#82ca9d" />
      </BarChart>
    </ResponsiveContainer>
  );
};

/**
 * Accepts Chart.js-style data: { labels: string[], datasets: [{ label, data: number[] }] }
 * and renders a Recharts line chart for "Student Performance Over Time".
 */
export const PerformanceChart = ({ data }) => {
  const rechartsData =
    data?.labels?.map((name, i) => {
      const point = { name };
      data.datasets?.forEach((ds) => {
        point[ds.label] = ds.data[i];
      });
      return point;
    }) ?? [];

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={rechartsData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" />
        <YAxis />
        <Tooltip />
        <Legend />
        {data?.datasets?.map((ds, i) => (
          <Line
            key={ds.label}
            type="monotone"
            dataKey={ds.label}
            stroke={['#4bc0c0', '#ff6384', '#ffce56'][i % 3]}
            strokeWidth={2}
            dot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
};
