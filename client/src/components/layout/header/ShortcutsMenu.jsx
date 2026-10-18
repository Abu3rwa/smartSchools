import { useMemo, useState } from 'react';
import { Menu, MenuItem, Checkbox, ListItemText, Divider } from '@mui/material';

const ShortcutsMenu = ({
    anchorEl,
    open,
    onClose,
    isRtl,
    t,
    maxShortcuts,
    availableShortcuts,
    selectedShortcutPaths,
    currentShortcutPath,
    canPinCurrentPage,
    onPinCurrentPage,
    onToggleShortcut,
    onReorderShortcuts,
}) => {
    const [draggedPath, setDraggedPath] = useState(null);

    const selectedShortcuts = useMemo(() => {
        const byPath = new Map(availableShortcuts.map((item) => [item.path, item]));
        return selectedShortcutPaths.map((path) => byPath.get(path)).filter(Boolean);
    }, [availableShortcuts, selectedShortcutPaths]);

    return (
        <Menu
            anchorEl={anchorEl}
            open={open}
            onClose={onClose}
            anchorOrigin={{ vertical: 'bottom', horizontal: isRtl ? 'left' : 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: isRtl ? 'left' : 'right' }}
            PaperProps={{ sx: { minWidth: 300, mt: 1.5 } }}
        >
            <MenuItem disabled>
                <ListItemText
                    primary={t('layout.header:shortcuts.title')}
                    secondary={t('layout.header:shortcuts.hint', { max: maxShortcuts })}
                />
            </MenuItem>

            <MenuItem
                onClick={onPinCurrentPage}
                disabled={!canPinCurrentPage}
            >
                <ListItemText
                    primary={t('layout.header:shortcuts.pinCurrentPage')}
                    secondary={currentShortcutPath || t('layout.header:shortcuts.pinCurrentPageDisabled')}
                />
            </MenuItem>

            <Divider />

            <MenuItem disabled>
                <ListItemText
                    primary={t('layout.header:shortcuts.orderTitle')}
                    secondary={t('layout.header:shortcuts.orderHint')}
                />
            </MenuItem>
            {selectedShortcuts.length === 0 && (
                <MenuItem disabled>
                    <ListItemText primary={t('layout.header:shortcuts.none')} />
                </MenuItem>
            )}
            {selectedShortcuts.map((shortcut) => (
                <MenuItem
                    key={`order-${shortcut.path}`}
                    draggable
                    className="header-shortcut-order-item"
                    onDragStart={() => setDraggedPath(shortcut.path)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                        onReorderShortcuts(draggedPath, shortcut.path);
                        setDraggedPath(null);
                    }}
                    onDragEnd={() => setDraggedPath(null)}
                >
                    <ListItemText primary={t(`layout.sidebar:items.${shortcut.labelKey}`)} />
                    <span className="header-shortcut-drag-handle">||</span>
                </MenuItem>
            ))}

            <Divider />

            {availableShortcuts.map((shortcut) => {
                const checked = selectedShortcutPaths.includes(shortcut.path);
                const disableAdd = !checked && selectedShortcutPaths.length >= maxShortcuts;
                return (
                    <MenuItem
                        key={shortcut.path}
                        onClick={() => onToggleShortcut(shortcut.path)}
                        disabled={disableAdd}
                    >
                        <Checkbox checked={checked} size="small" />
                        <ListItemText primary={t(`layout.sidebar:items.${shortcut.labelKey}`)} />
                    </MenuItem>
                );
            })}
        </Menu>
    );
};

export default ShortcutsMenu;
