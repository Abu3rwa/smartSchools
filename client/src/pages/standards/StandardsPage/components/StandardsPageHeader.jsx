const StandardsPageHeader = ({ title, subtitle, action, children }) => (
    <header className="standards-workspace-header">
        <div className="standards-workspace-header__text">
            <h1>{title}</h1>
            {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {action ? <div className="standards-workspace-header__action">{action}</div> : null}
        <div className="standards-workspace-header__tabs">{children}</div>
    </header>
);

export default StandardsPageHeader;
