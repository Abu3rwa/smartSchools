import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

export default function BehaviorDialog({
    title,
    onClose,
    children,
    dirty = false,
    busy = false
}) {
    const dialog = useRef(null);
    const { t } = useTranslation('behaviorConsequences');
    useEffect(() => {
        const element = dialog.current;
        const previous = document.activeElement;
        element.showModal();
        return () => {
            element.close();
            previous?.focus?.();
        };
    }, []);
    useEffect(() => {
        const unload = (event) => {
            if (!dirty && !busy) return;
            event.preventDefault();
            event.returnValue = '';
        };
        const navigate = (event) => {
            if (
                (!dirty && !busy) ||
                !event.cancelable ||
                !event.destination.sameDocument
            )
                return;
            if (busy || !window.confirm(t('behaviorLog.discardPrompt')))
                event.preventDefault();
        };
        window.addEventListener('beforeunload', unload);
        window.navigation?.addEventListener('navigate', navigate);
        return () => {
            window.removeEventListener('beforeunload', unload);
            window.navigation?.removeEventListener('navigate', navigate);
        };
    }, [dirty, busy, t]);
    return (
        <dialog
            className="bl-dialog"
            ref={dialog}
            aria-labelledby="bl-dialog-title"
            onCancel={(event) => {
                event.preventDefault();
                onClose();
            }}
        >
            <header>
                <h2 id="bl-dialog-title">{title}</h2>
                <button type="button" onClick={onClose}>
                    {t('common.close')}
                </button>
            </header>
            {children}
        </dialog>
    );
}
