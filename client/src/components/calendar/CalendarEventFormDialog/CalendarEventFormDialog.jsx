import {
    Alert,
    Autocomplete,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    MenuItem,
    Stack,
    Switch,
    TextField
} from '@mui/material';
import './CalendarEventFormDialog.css';

const CalendarEventFormDialog = ({
    open,
    editingEvent,
    formError,
    formState,
    setFormState,
    mutationLoading,
    audienceAutocompleteOptions,
    selectedAudienceUsers,
    audienceUserLoading,
    onSetAudienceUserSearch,
    onClose,
    onSubmit,
    categoryOptions = [],
    recurrenceFrequencyOptions = [],
    recurrenceWeekdayOptions = [],
    visibilityOptions = [],
    toAudienceOption,
    t
}) => {
    const normalizedAudienceOption = (option) => (toAudienceOption ? toAudienceOption(option) : option);
    const getAudienceLabel = (option) => {
        const normalized = normalizedAudienceOption(option) || {};
        if (typeof normalized.label === 'string' && normalized.label.trim()) {
            return normalized.label;
        }

        const firstName = String(normalized.firstName || '').trim();
        const lastName = String(normalized.lastName || '').trim();
        const fullName = `${firstName} ${lastName}`.trim();
        if (fullName) return fullName;

        const email = String(normalized.email || '').trim();
        if (email) return email;

        const fallbackId = String(normalized.id || normalized._id || '').trim();
        return fallbackId || 'User';
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
            <DialogTitle>{editingEvent ? t('calendar:dialog.editTitle') : t('calendar:dialog.addTitle')}</DialogTitle>
            <DialogContent>
                <Stack spacing={1.5} sx={{ mt: 0.5 }}>
                    {formError && <Alert severity="error">{formError}</Alert>}
                    <TextField
                        label={t('calendar:dialog.fields.title')}
                        value={formState.title}
                        onChange={(event) => setFormState((previous) => ({ ...previous, title: event.target.value }))}
                        required
                    />
                    <TextField
                        label={t('calendar:dialog.fields.description')}
                        value={formState.description}
                        onChange={(event) => setFormState((previous) => ({ ...previous, description: event.target.value }))}
                        multiline
                        minRows={2}
                    />
                    <TextField
                        select
                        label={t('calendar:dialog.fields.category')}
                        value={formState.category}
                        onChange={(event) => setFormState((previous) => ({ ...previous, category: event.target.value }))}
                    >
                        {categoryOptions.filter((item) => item.value !== 'ALL').map((item) => (
                            <MenuItem key={item.value} value={item.value}>
                                {item.labelKey ? t(item.labelKey) : item.label}
                            </MenuItem>
                        ))}
                    </TextField>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                        <TextField
                            label={t('calendar:dialog.fields.start')}
                            type="datetime-local"
                            value={formState.startAt}
                            onChange={(event) => setFormState((previous) => ({ ...previous, startAt: event.target.value }))}
                            InputLabelProps={{ shrink: true }}
                            fullWidth
                            required
                        />
                        <TextField
                            label={t('calendar:dialog.fields.end')}
                            type="datetime-local"
                            value={formState.endAt}
                            onChange={(event) => setFormState((previous) => ({ ...previous, endAt: event.target.value }))}
                            InputLabelProps={{ shrink: true }}
                            fullWidth
                            required
                        />
                    </Stack>
                    <FormControlLabel
                        control={(
                            <Switch
                                checked={formState.allDay}
                                onChange={(event) => setFormState((previous) => ({ ...previous, allDay: event.target.checked }))}
                            />
                        )}
                        label={t('calendar:dialog.fields.allDay')}
                    />
                    <FormControlLabel
                        control={(
                            <Switch
                                checked={formState.isRecurring}
                                onChange={(event) => setFormState((previous) => ({
                                    ...previous,
                                    isRecurring: event.target.checked
                                }))}
                            />
                        )}
                        label={t('calendar:dialog.fields.recurring')}
                    />
                    {formState.isRecurring && (
                        <Stack spacing={1.25}>
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                                <TextField
                                    select
                                    label={t('calendar:dialog.fields.repeat')}
                                    value={formState.recurrenceFrequency}
                                    onChange={(event) => setFormState((previous) => ({
                                        ...previous,
                                        recurrenceFrequency: event.target.value
                                    }))}
                                    fullWidth
                                >
                                    {recurrenceFrequencyOptions.map((option) => (
                                        <MenuItem key={option.value} value={option.value}>
                                            {option.labelKey ? t(option.labelKey) : option.label}
                                        </MenuItem>
                                    ))}
                                </TextField>
                                <TextField
                                    label={t('calendar:dialog.fields.interval')}
                                    type="number"
                                    value={formState.recurrenceInterval}
                                    onChange={(event) => setFormState((previous) => ({
                                        ...previous,
                                        recurrenceInterval: event.target.value
                                    }))}
                                    inputProps={{ min: 1, max: 52 }}
                                    fullWidth
                                />
                            </Stack>

                            {formState.recurrenceFrequency === 'WEEKLY' && (
                                <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap">
                                    {recurrenceWeekdayOptions.map((item) => {
                                        const selected = formState.recurrenceWeekDays.includes(item.value);
                                        return (
                                            <Chip
                                                key={item.value}
                                                label={item.labelKey ? t(item.labelKey) : item.label}
                                                color={selected ? 'primary' : 'default'}
                                                variant={selected ? 'filled' : 'outlined'}
                                                onClick={() => {
                                                    setFormState((previous) => {
                                                        const current = Array.isArray(previous.recurrenceWeekDays)
                                                            ? previous.recurrenceWeekDays
                                                            : [];
                                                        const next = current.includes(item.value)
                                                            ? current.filter((value) => value !== item.value)
                                                            : [...current, item.value];
                                                        return {
                                                            ...previous,
                                                            recurrenceWeekDays: next.sort((left, right) => left - right)
                                                        };
                                                    });
                                                }}
                                            />
                                        );
                                    })}
                                </Stack>
                            )}

                            <TextField
                                label={t('calendar:dialog.fields.repeatUntilOptional')}
                                type="datetime-local"
                                value={formState.recurrenceUntil}
                                onChange={(event) => setFormState((previous) => ({
                                    ...previous,
                                    recurrenceUntil: event.target.value
                                }))}
                                InputLabelProps={{ shrink: true }}
                                fullWidth
                            />
                        </Stack>
                    )}
                    <TextField
                        label={t('calendar:dialog.fields.locationOptional')}
                        value={formState.location}
                        onChange={(event) => setFormState((previous) => ({ ...previous, location: event.target.value }))}
                    />
                    <TextField
                        select
                        label={t('calendar:dialog.fields.audience')}
                        value={formState.visibility}
                        onChange={(event) => setFormState((previous) => ({ ...previous, visibility: event.target.value }))}
                    >
                        {visibilityOptions.map((option) => (
                            <MenuItem key={option.value} value={option.value}>
                                {option.labelKey ? t(option.labelKey) : option.label}
                            </MenuItem>
                        ))}
                    </TextField>
                    {formState.visibility === 'CUSTOM' && (
                        <Autocomplete
                            multiple
                            options={audienceAutocompleteOptions}
                            value={selectedAudienceUsers}
                            loading={audienceUserLoading}
                            onChange={(event, selected) => {
                                setFormState((previous) => ({
                                    ...previous,
                                    audienceUsers: selected.map(normalizedAudienceOption)
                                }));
                            }}
                            onInputChange={(event, value) => {
                                onSetAudienceUserSearch(value);
                            }}
                            filterOptions={(options) => options}
                            getOptionLabel={(option) => getAudienceLabel(option)}
                            isOptionEqualToValue={(option, value) => {
                                const left = normalizedAudienceOption(option);
                                const right = normalizedAudienceOption(value);
                                if (left.id && right.id) return left.id === right.id;
                                return left.email === right.email;
                            }}
                            renderOption={(props, option) => {
                                const label = getAudienceLabel(option);
                                return (
                                    <li {...props}>
                                        {label}
                                    </li>
                                );
                            }}
                            renderTags={(value, getTagProps) =>
                                value.map((option, index) => {
                                    const label = getAudienceLabel(option);
                                    return (
                                        <Chip
                                            key={`${label}-${index}`}
                                            label={label}
                                            size="small"
                                            {...getTagProps({ index })}
                                        />
                                    );
                                })
                            }
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    label={t('calendar:dialog.fields.recipientUsers')}
                                    placeholder={t('calendar:dialog.fields.recipientPlaceholder')}
                                    helperText={t('calendar:dialog.fields.recipientHelper')}
                                />
                            )}
                        />
                    )}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>{t('calendar:common.close')}</Button>
                <Button variant="contained" onClick={onSubmit} disabled={mutationLoading}>
                    {mutationLoading
                        ? t('calendar:common.saving')
                        : (editingEvent ? t('calendar:dialog.actions.saveChanges') : t('calendar:dialog.actions.createEvent'))}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default CalendarEventFormDialog;
