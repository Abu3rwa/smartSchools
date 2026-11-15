import { toneVar } from '../constants';

const KpiTile = ({ tone, icon: Icon, value, label, percent }) => {
    const style = { '--tone': toneVar(tone) };
    const dim = value === '—';

    return (
        <div className="td-kpi" style={style}>
            {typeof percent === 'number' ? (
                <span className="td-ring" style={{ ...style, '--p': percent }} aria-hidden="true">
                    <i>
                        <Icon size={16} />
                    </i>
                </span>
            ) : (
                <span className="td-plate" aria-hidden="true">
                    <Icon size={20} />
                </span>
            )}
            <div className="td-kpi-body">
                <div className={`td-kpi-val${dim ? ' dim' : ''}`}>{value}</div>
                <div className="td-kpi-lab">{label}</div>
            </div>
        </div>
    );
};

const KpiRow = ({ items }) => (
    <div className="td-kpis">
        {items.map((item) => (
            <KpiTile key={item.label} {...item} />
        ))}
    </div>
);

export default KpiRow;