import { Alert, Stack } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import CalendarEventActionsMenu from './components/CalendarEventActionsMenu';
import CalendarPageHeader from './components/CalendarPageHeader';
import CalendarEventFormDialog from '../../../../components/calendar/CalendarEventFormDialog';
import CalendarFilterChips from '../../../../components/calendar/CalendarFilterChips';
import CalendarMonthGrid from '../../../../components/calendar/CalendarMonthGrid';
import CalendarUpcomingEventsList from '../../../../components/calendar/CalendarUpcomingEventsList';
import useSchoolCalendarData from './hooks/useSchoolCalendarData';
import useSchoolCalendarPermissions from './hooks/useSchoolCalendarPermissions';
import {
    CALENDAR_FILTER_OPTIONS,
    CALENDAR_RECURRENCE_FREQUENCY_OPTIONS,
    CALENDAR_RECURRENCE_WEEKDAY_OPTIONS,
    CALENDAR_VISIBILITY_OPTIONS,
    CALENDAR_WEEKDAY_LABELS
} from './constants';
import {
    formatCalendarEventDateRange,
    formatCalendarRecurrenceSummary,
    getCategoryIconComponent,
    toAudienceOption
} from './utils/calendarPresentation';
import { useTranslation } from 'react-i18next';
import './AdminSchoolCalendarPage.css';

const AdminSchoolCalendarPage = () => {
    const { t } = useTranslation(['calendar']);
    const theme = useTheme();

    const { canManage } = useSchoolCalendarPermissions();
    const {
        categoryStyles,
        calendarError,
        mutationLoading,
        activeFilter,
        setActiveFilter,
        currentMonth,
        selectedDate,
        setSelectedDate,
        monthGridCells,
        selectedDayEvents,
        dayStylesByKey,
        monthLoading,
        upcomingLoading,
        upcomingEvents,
        preferences,
        dialogOpen,
        editingEvent,
        formState,
        setFormState,
        formError,
        openCreateDialog,
        closeDialog,
        submitEventForm,
        audienceAutocompleteOptions,
        selectedAudienceUsers,
        audienceUserLoading,
        setAudienceUserSearch,
        menuAnchor,
        openEventActionsMenu,
        closeEventActionsMenu,
        handleEditFromMenu,
        handleCancelFromMenu,
        handleNotificationToggle,
        goToPreviousMonth,
        goToNextMonth,
        getDayCellStyle,
        isEventNotificationEnabled
    } = useSchoolCalendarData(theme, t);

    return (
        <div className="admin-school-calendar-page">
            <Stack spacing={2}>
                <CalendarPageHeader
                    canManage={canManage}
                    mutationLoading={mutationLoading}
                    onAddEvent={openCreateDialog}
                />

                {calendarError && (
                    <Alert severity="error">{calendarError}</Alert>
                )}

                <CalendarFilterChips
                    activeFilter={activeFilter}
                    onChangeFilter={setActiveFilter}
                    options={CALENDAR_FILTER_OPTIONS}
                    t={t}
                />

                <div className="calendar-layout-grid">
                    <CalendarMonthGrid
                        currentMonth={currentMonth}
                        selectedDate={selectedDate}
                        monthGridCells={monthGridCells}
                        selectedDayEvents={selectedDayEvents}
                        categoryStyles={categoryStyles}
                        dayStylesByKey={dayStylesByKey}
                        weekdayLabels={CALENDAR_WEEKDAY_LABELS}
                        onPreviousMonth={goToPreviousMonth}
                        onNextMonth={goToNextMonth}
                        onSelectDate={setSelectedDate}
                        getDayCellStyle={getDayCellStyle}
                        t={t}
                    />

                    <CalendarUpcomingEventsList
                        upcomingLoading={upcomingLoading}
                        monthLoading={monthLoading}
                        upcomingEvents={upcomingEvents}
                        categoryStyles={categoryStyles}
                        preferences={preferences}
                        canManage={canManage}
                        isEventNotificationEnabled={isEventNotificationEnabled}
                        onToggleNotification={handleNotificationToggle}
                        onOpenEventMenu={openEventActionsMenu}
                        formatCalendarEventDateRange={formatCalendarEventDateRange}
                        formatCalendarRecurrenceSummary={(event) => formatCalendarRecurrenceSummary(event, t)}
                        getCategoryIconComponent={getCategoryIconComponent}
                        t={t}
                    />
                </div>
            </Stack>

            <CalendarEventFormDialog
                open={dialogOpen}
                editingEvent={editingEvent}
                formError={formError}
                formState={formState}
                setFormState={setFormState}
                mutationLoading={mutationLoading}
                audienceAutocompleteOptions={audienceAutocompleteOptions}
                selectedAudienceUsers={selectedAudienceUsers}
                audienceUserLoading={audienceUserLoading}
                onSetAudienceUserSearch={setAudienceUserSearch}
                onClose={closeDialog}
                onSubmit={submitEventForm}
                categoryOptions={CALENDAR_FILTER_OPTIONS}
                recurrenceFrequencyOptions={CALENDAR_RECURRENCE_FREQUENCY_OPTIONS}
                recurrenceWeekdayOptions={CALENDAR_RECURRENCE_WEEKDAY_OPTIONS}
                visibilityOptions={CALENDAR_VISIBILITY_OPTIONS}
                toAudienceOption={toAudienceOption}
                t={t}
            />

            <CalendarEventActionsMenu
                anchorEl={menuAnchor}
                onClose={closeEventActionsMenu}
                onEdit={handleEditFromMenu}
                onCancel={handleCancelFromMenu}
                t={t}
            />
        </div>
    );
};

export default AdminSchoolCalendarPage;
