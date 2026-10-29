import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const COLORS = ['#14b8a6', '#0ea5e9', '#6366f1', '#f59e0b', '#ec4899', '#22c55e'];

export default function ClassComparisonSection({ classes, explaining, grades, narrative, onExplain }) {
    const { t } = useTranslation(['spellingAnalysis']);
    const chartData = classes.map((row) => ({
        name: row.className,
        accuracy: row.accuracy,
        recovery: row.recoveryRate
    }));

    return (
        <section className="sa-card">
            <header className="sa-card-head">
                <div>
                    <h2>{t('spellingAnalysis:classes.title')}</h2>
                    <p>{t('spellingAnalysis:classes.hint')}</p>
                </div>
                <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={explaining || classes.length === 0}
                    onClick={onExplain}
                >
                    {explaining ? t('spellingAnalysis:narrative.loading') : t('spellingAnalysis:narrative.action')}
                </button>
            </header>

            {classes.length === 0 ? (
                <p className="sa-empty">{t('spellingAnalysis:classes.empty')}</p>
            ) : (
                <>
                    <div className="sa-chart">
                        <ResponsiveContainer width="100%" height={240}>
                            <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light, #e2e8f0)" vertical={false} />
                                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} unit="%" />
                                <Tooltip formatter={(value) => `${value}%`} />
                                <Bar dataKey="accuracy" radius={[8, 8, 0, 0]} barSize={38}>
                                    {chartData.map((entry, index) => (
                                        <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="sa-table-wrap">
                        <table className="sa-table">
                            <thead>
                                <tr>
                                    <th>{t('spellingAnalysis:classes.columns.class')}</th>
                                    <th>{t('spellingAnalysis:classes.columns.year')}</th>
                                    <th>{t('spellingAnalysis:classes.columns.students')}</th>
                                    <th>{t('spellingAnalysis:classes.columns.accuracy')}</th>
                                    <th>{t('spellingAnalysis:classes.columns.recovery')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {classes.map((row) => (
                                    <tr key={`${row.classId}-${row.academicYear}`}>
                                        <td className="sa-strong">{row.className}</td>
                                        <td>{row.academicYear}</td>
                                        <td className="sa-num">{row.students}</td>
                                        <td className="sa-num">{row.accuracy}%</td>
                                        <td className="sa-num">{row.recoveryRate}%</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {narrative && <blockquote className="sa-narrative">{narrative}</blockquote>}

            {grades.length > 1 && (
                <div className="sa-grades">
                    <h3>{t('spellingAnalysis:grades.title')}</h3>
                    <div className="sa-grade-chips">
                        {grades.map((row) => (
                            <div key={row.grade} className="sa-grade-chip">
                                <span>{row.grade}</span>
                                <strong>{row.accuracy}%</strong>
                                <small>{t('spellingAnalysis:grades.recovery', { value: row.recoveryRate })}</small>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </section>
    );
}
