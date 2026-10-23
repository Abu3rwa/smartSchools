import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { HiOutlineChevronDown } from 'react-icons/hi';

const GradebookMenu = ({
    label,
    icon: TriggerIcon,
    triggerClassName = 'btn btn-outline',
    items = [],
    disabled,
    className = '',
    panelClassName = ''
}) => {
    const [expanded, setExpanded] = useState(false);
    const rootRef = useRef(null);
    const triggerRef = useRef(null);

    useEffect(() => {
        if (!expanded) return undefined;

        const handlePointerDown = (event) => {
            if (rootRef.current && !rootRef.current.contains(event.target)) setExpanded(false);
        };
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                setExpanded(false);
                triggerRef.current?.focus();
            }
        };

        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [expanded]);

    const close = () => setExpanded(false);

    return (
        <div ref={rootRef} className={`gradebook-menu ${className}`}>
            <button
                ref={triggerRef}
                type="button"
                className={`${triggerClassName} gradebook-menu__trigger`}
                aria-expanded={expanded}
                aria-haspopup="true"
                disabled={disabled}
                onClick={() => setExpanded((current) => !current)}
            >
                {TriggerIcon ? <TriggerIcon size={18} /> : null}
                <span>{label}</span>
                <HiOutlineChevronDown size={14} />
            </button>

            {expanded && !disabled && (
                <div className={`gradebook-menu__panel ${panelClassName}`} role="menu">
                    {items.map((item) => {
                        if (item.divider) return <div key={item.id} className="gradebook-menu__divider" />;

                        if (item.render) {
                            return (
                                <div key={item.id} className="gradebook-menu__section">
                                    {item.render({ close })}
                                </div>
                            );
                        }

                        const ItemIcon = item.icon;
                        const handleClick = () => {
                            item.onSelect?.();
                            close();
                        };

                            const content = (
                                <>
                                    {ItemIcon ? <ItemIcon size={18} /> : null}
                                    <span className="gradebook-menu__item-text">
                                        <span>{item.label}</span>
                                        {item.meta ? <span className="gradebook-menu__item-meta">{item.meta}</span> : null}
                                    </span>
                                </>
                            );

                            if (item.to) {
                                return (
                                    <Link
                                        key={item.id}
                                        to={item.to}
                                        className="gradebook-menu__item"
                                        role="menuitem"
                                        onClick={handleClick}
                                    >
                                        {content}
                                    </Link>
                                );
                            }

                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    className="gradebook-menu__item"
                                    role="menuitem"
                                    disabled={item.disabled}
                                    onClick={handleClick}
                                >
                                    {content}
                                </button>
                            );
                    })}
                </div>
            )}
        </div>
    );
};

export default GradebookMenu;
