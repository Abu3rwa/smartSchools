import { useTranslation } from 'react-i18next';
import {
    HiOutlineAcademicCap,
    HiOutlineCurrencyDollar,
    HiOutlineOfficeBuilding,
    HiOutlineSparkles,
    HiOutlineUserGroup,
} from 'react-icons/hi';
import {
    formatCents,
    formatCount,
    formatMoney,
} from '../utils/platformDashboardPresentation.js';

export default function PlatformKpiStrip({ summary, locale }) {
    const { t } = useTranslation(['superAdminDashboard']);
    const { schools, people, money, ai } = summary;

    const items = [
        {
            key: 'schools',
            icon: HiOutlineOfficeBuilding,
            label: t('superAdminDashboard:kpis.schools'),
            value: formatCount(schools.total, locale),
            meta: t('superAdminDashboard:kpis.schoolsMeta', {
                active: formatCount(schools.active, locale),
                trial: formatCount(schools.trial, locale),
            }),
        },
        {
            key: 'students',
            icon: HiOutlineAcademicCap,
            label: t('superAdminDashboard:kpis.students'),
            value: formatCount(people.students, locale),
            meta: t('superAdminDashboard:kpis.studentsMeta', {
                newCount: formatCount(people.newStudentsInRange, locale),
            }),
        },
        {
            key: 'staff',
            icon: HiOutlineUserGroup,
            label: t('superAdminDashboard:kpis.staff'),
            value: formatCount(people.staff, locale),
            meta: t('superAdminDashboard:kpis.staffMeta', {
                active: formatCount(people.activeSchools30d, locale),
                total: formatCount(schools.total, locale),
            }),
        },
        {
            key: 'mrr',
            icon: HiOutlineCurrencyDollar,
            label: t('superAdminDashboard:kpis.mrr'),
            value: formatMoney(money.mrr, locale, money.currency),
            meta: t('superAdminDashboard:kpis.mrrMeta', {
                arr: formatMoney(money.arr, locale, money.currency),
                collected: formatMoney(money.collectedInRange, locale, money.currency),
            }),
        },
        {
            key: 'ai',
            icon: HiOutlineSparkles,
            label: t('superAdminDashboard:kpis.aiProfit'),
            value: formatCents(ai.profitCents, locale, money.currency),
            meta: t('superAdminDashboard:kpis.aiMeta', {
                charged: formatCents(ai.chargedCents, locale, money.currency),
                cost: formatCents(ai.providerCostCents, locale, money.currency),
            }),
        },
    ];

    return (
        <section className="platform-kpi-strip" aria-label={t('superAdminDashboard:kpis.label')}>
            {items.map((item) => {
                const Icon = item.icon;
                return (
                    <div className="platform-kpi" key={item.key}>
                        <span className={`platform-kpi-icon is-${item.key}`} aria-hidden="true">
                            <Icon size={18} />
                        </span>
                        <span className="platform-kpi-label">{item.label}</span>
                        <span className="platform-kpi-value">{item.value}</span>
                        <span className="platform-kpi-meta">{item.meta}</span>
                    </div>
                );
            })}
        </section>
    );
}
