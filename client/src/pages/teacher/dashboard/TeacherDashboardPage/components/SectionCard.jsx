const SectionCard = ({ title, icon: Icon, action, children, className }) => {
    return (
        <div className={`teacher-card ${className || ''}`.trim()}>
            <div className="card-header">
                <h3 className="card-title">
                    {Icon && <Icon className="card-icon" size={20} />}
                    {title}
                </h3>
                {action}
            </div>
            {children}
        </div>
    );
};

export default SectionCard;
