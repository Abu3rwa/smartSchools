import { useMemo, useState } from 'react';
import { Popover, IconButton, Checkbox, TextField, InputAdornment } from '@mui/material';
import {
    HiOutlineChevronUp,
    HiOutlineChevronDown,
    HiOutlineXMark,
    HiOutlineMagnifyingGlass,
} from 'react-icons/hi2';

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
    const [query, setQuery] = useState('');
    const [draggedPath, setDraggedPath] = useState(null);

    const needle = query.trim().toLowerCase();

    const shortcutLabel = (shortcut) => t(`layout.sidebar:items.${shortcut.labelKey}`);

    const filteredShortcuts = useMemo(() => {
        if (!needle) return availableShortcuts;
        return availableShortcuts.filter((shortcut) => (
            shortcutLabel(shortcut).toLowerCase().includes(needle)
        ));
        // eslint-disable-next-line react-hooks/exhaustive-deps -- label text is derived from t
    }, [availableShortcuts, needle, t]);

    const selectedByPath = useMemo(
        () => new Map(availableShortcuts.map((item) => [item.path, item])),
        [availableShortcuts]
    );

    const orderedSelected = useMemo(() => (
        selectedShortcutPaths
            .map((path) => selectedByPath.get(path))
            .filter(Boolean)
    ), [selectedByPath, selectedShortcutPaths]);

    const visibleSelected = useMemo(() => {
        if (!needle) return orderedSelected;
        const visiblePaths = new Set(filteredShortcuts.map((item) => item.path));
        return orderedSelected.filter((item) => visiblePaths.has(item.path));
    }, [filteredShortcuts, needle, orderedSelected]);

    const candidateGroups = useMemo(() => {
        const groups = new Map();
        for (const shortcut of filteredShortcuts) {
            const key = shortcut.section || 'account';
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(shortcut);
        }
        return Array.from(groups, ([section, items]) => ({ section, items }));
    }, [filteredShortcuts]);

    const moveShortcut = (path, direction) => {
        const index = selectedShortcutPaths.indexOf(path);
        const neighbour = selectedShortcutPaths[index + direction];
        if (index < 0 || !neighbour) return;
        onReorderShortcuts(path, neighbour);
    };

    const isAtLimit = selectedShortcutPaths.length >= maxShortcuts;

    return (
        <Popover
            anchorEl={anchorEl}
            open={open}
            onClose={onClose}
            anchorOrigin={{ vertical: 'bottom', horizontal: isRtl ? 'right' : 'left' }}
            transformOrigin={{ vertical: 'top', horizontal: isRtl ? 'right' : 'left' }}
            slotProps={{
                paper: {
                    className: 'shortcuts-panel',
                    sx: { width: 348, maxHeight: '72vh', overflow: 'hidden' },
                },
            }}
        >
            <div className="shortcuts-panel-head">
                <div>
                    <div className="shortcuts-panel-title">{t('layout.header:shortcuts.title')}</div>
                    <div className="shortcuts-panel-hint">
                        {t('layout.header:shortcuts.hint', { max: maxShortcuts })}
                    </div>
                </div>
                <span className="shortcuts-panel-count">
                    {selectedShortcutPaths.length}/{maxShortcuts}
                </span>
            </div>

            <div className="shortcuts-panel-search">
                <TextField
                    fullWidth
                    size="small"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t('layout.header:shortcuts.searchPlaceholder')}
                    inputProps={{ 'aria-label': t('layout.header:shortcuts.searchPlaceholder') }}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <HiOutlineMagnifyingGlass size={16} />
                            </InputAdornment>
                        ),
                        endAdornment: query ? (
                            <InputAdornment position="end">
                                <IconButton
                                    size="small"
                                    aria-label={t('layout.header:shortcuts.clearSearch')}
                                    onClick={() => setQuery('')}
                                >
                                    <HiOutlineXMark size={16} />
                                </IconButton>
                            </InputAdornment>
                        ) : null,
                    }}
                />
            </div>

            <button
                type="button"
                className="shortcuts-panel-pin"
                onClick={onPinCurrentPage}
                disabled={!canPinCurrentPage}
            >
                <span>{t('layout.header:shortcuts.pinCurrentPage')}</span>
                <span className="shortcuts-panel-pin-path">
                    {currentShortcutPath || t('layout.header:shortcuts.pinCurrentPageDisabled')}
                </span>
            </button>

            <div className="shortcuts-panel-body">
                <div className="shortcuts-panel-section">
                    {t('layout.header:shortcuts.orderTitle')}
                    <span className="shortcuts-panel-section-hint">
                        {t('layout.header:shortcuts.orderHint')}
                    </span>
                </div>

                {visibleSelected.length === 0 && (
                    <div className="shortcuts-panel-empty">{t('layout.header:shortcuts.none')}</div>
                )}

                {visibleSelected.map((shortcut) => {
                    const index = selectedShortcutPaths.indexOf(shortcut.path);
                    return (
                        <div
                            key={`order-${shortcut.path}`}
                            className="shortcuts-panel-row header-shortcut-order-item"
                            draggable
                            onDragStart={() => setDraggedPath(shortcut.path)}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={() => {
                                onReorderShortcuts(draggedPath, shortcut.path);
                                setDraggedPath(null);
                            }}
                            onDragEnd={() => setDraggedPath(null)}
                        >
                            <span className="header-shortcut-drag-handle" aria-hidden="true">⠿</span>
                            <span className="shortcuts-panel-row-label">
                                {shortcutLabel(shortcut)}
                            </span>
                            <span className="shortcuts-panel-row-actions">
                                <IconButton
                                    size="small"
                                    aria-label={t('layout.header:shortcuts.moveUp')}
                                    disabled={index === 0}
                                    onClick={() => moveShortcut(shortcut.path, -1)}
                                >
                                    <HiOutlineChevronUp size={16} />
                                </IconButton>
                                <IconButton
                                    size="small"
                                    aria-label={t('layout.header:shortcuts.moveDown')}
                                    disabled={index === selectedShortcutPaths.length - 1}
                                    onClick={() => moveShortcut(shortcut.path, 1)}
                                >
                                    <HiOutlineChevronDown size={16} />
                                </IconButton>
                                <IconButton
                                    size="small"
                                    aria-label={t('layout.header:shortcuts.remove')}
                                    onClick={() => onToggleShortcut(shortcut.path)}
                                >
                                    <HiOutlineXMark size={16} />
                                </IconButton>
                            </span>
                        </div>
                    );
                })}

                {candidateGroups.map((group) => (
                    <div key={`group-${group.section}`}>
                        <div className="shortcuts-panel-section">
                            {t(`layout.sidebar:sections.${group.section}`)}
                        </div>
                        {group.items.map((shortcut) => {
                            const checked = selectedShortcutPaths.includes(shortcut.path);
                            return (
                                <button
                                    key={shortcut.path}
                                    type="button"
                                    className="shortcuts-panel-row shortcuts-panel-row--add"
                                    onClick={() => onToggleShortcut(shortcut.path)}
                                    disabled={!checked && isAtLimit}
                                    aria-pressed={checked}
                                >
                                    <Checkbox
                                        size="small"
                                        checked={checked}
                                        sx={{ p: 0.5, mr: 1 }}
                                    />
                                    <span className="shortcuts-panel-row-label">
                                        {shortcutLabel(shortcut)}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                ))}

                {filteredShortcuts.length === 0 && (
                    <div className="shortcuts-panel-empty">
                        {t('layout.header:shortcuts.noResults')}
                    </div>
                )}
            </div>
        </Popover>
    );
};

export default ShortcutsMenu;
