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
    toAudienceOption
}) => {
    const normalizedAudienceOption = (option) => (toAudienceOption ? toAudienceOption(option) : option);

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
            <DialogTitle>{editingEvent ? 'Edit Event' : 'Add Event'}</DialogTitle>
            <DialogContent>
                <Stack spacing={1.5} sx={{ mt: 0.5 }}>
                    {formError && <Alert severity="error">{formError}</Alert>}
                    <TextField
                        label="Title"
                        value={formState.title}
                        onChange={(event) => setFormState((previous) => ({ ...previous, title: event.target.value }))}
                        required
                    />
                    <TextField
                        label="Description"
                        value={formState.description}
                        onChange={(event) => setFormState((previous) => ({ ...previous, description: event.target.value }))}
                        multiline
                        minRows={2}
                    />
                    <TextField
                        select
                        label="Category"
                        value={formState.category}
                        onChange={(event) => setFormState((previous) => ({ ...previous, category: event.target.value }))}
                    >
                        {categoryOptions.filter((item) => item.value !== 'ALL').map((item) => (
                            <MenuItem key={item.value} value={item.value}>
                                {item.label}
                            </MenuItem>
                        ))}
                    </TextField>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                        <TextField
                            label="Start"
                            type="datetime-local"
                            value={formState.startAt}
                            onChange={(event) => setFormState((previous) => ({ ...previous, startAt: event.target.value }))}
                            InputLabelProps={{ shrink: true }}
                            fullWidth
                            required
                        />
                        <TextField
                            label="End"
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
                        label="All Day"
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
                        label="Recurring Event"
                    />
                    {formState.isRecurring && (
                        <Stack spacing={1.25}>
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                                <TextField
                                    select
                                    label="Repeat"
                                    value={formState.recurrenceFrequency}
                                    onChange={(event) => setFormState((previous) => ({
                                        ...previous,
                                        recurrenceFrequency: event.target.value
                                    }))}
                                    fullWidth
                                >
                                    {recurrenceFrequencyOptions.map((option) => (
                                        <MenuItem key={option.value} value={option.value}>
                                            {option.label}
                                        </MenuItem>
                                    ))}
                                </TextField>
                                <TextField
                                    label="Interval"
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
                                                label={item.label}
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
                                label="Repeat Until (optional)"
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
                        label="Location (optional)"
                        value={formState.location}
                        onChange={(event) => setFormState((previous) => ({ ...previous, location: event.target.value }))}
                    />
                    <TextField
                        select
                        label="Audience"
                        value={formState.visibility}
                        onChange={(event) => setFormState((previous) => ({ ...previous, visibility: event.target.value }))}
                    >
                        {visibilityOptions.map((option) => (
                            <MenuItem key={option.value} value={option.value}>
                                {option.label}
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
                            getOptionLabel={(option) => normalizedAudienceOption(option).label}
                            isOptionEqualToValue={(option, value) => {
                                const left = normalizedAudienceOption(option);
                                const right = normalizedAudienceOption(value);
                                if (left.id && right.id) return left.id === right.id;
                                return left.email === right.email;
                            }}
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    label="Recipient Users"
                                    placeholder="Search by name or email"
                                    helperText="Select recipients. Result format: Name (email). Only selected users will receive this custom audience notification."
                                />
                            )}
                        />
                    )}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Close</Button>
                <Button variant="contained" onClick={onSubmit} disabled={mutationLoading}>
                    {mutationLoading ? 'Saving...' : (editingEvent ? 'Save Changes' : 'Create Event')}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default CalendarEventFormDialog;
