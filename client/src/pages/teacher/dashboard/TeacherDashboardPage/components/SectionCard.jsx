import { toneVar } from '../constants';

const SectionCard = ({ title, subtitle, icon: Icon, tone = 'teal', action, badge, children, className }) => (
    <section className={`td-card${className ? ` ${className}` : ''}`} style={{ '--tone': toneVar(tone) }}>
        <div className="td-head">
            {Icon && (
                <span className="td-plate">
                    <Icon size={17} />
                </span>
            )}
            <div className="td-heading">
                <h3 className="td-title">{title}</h3>
                {subtitle ? <p className="td-sub">{subtitle}</p> : null}
            </div>
            {action}
            {badge}
        </div>
        {children}
    </section>
);

export default SectionCard;