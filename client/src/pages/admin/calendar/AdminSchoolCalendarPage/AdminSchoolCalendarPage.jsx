import { Alert, Stack } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import CalendarEventActionsMenu from './components/CalendarEventActionsMenu';
import CalendarEventFormDialog from './components/CalendarEventFormDialog';
import CalendarFilterChips from './components/CalendarFilterChips';
import CalendarMonthPanel from './components/CalendarMonthPanel';
import CalendarPageHeader from './components/CalendarPageHeader';
import CalendarUpcomingPanel from './components/CalendarUpcomingPanel';
import useAdminSchoolCalendarController from './hooks/useAdminSchoolCalendarController';
import './AdminSchoolCalendarPage.css';

const AdminSchoolCalendarPage = () => {
    const theme = useTheme();

    const {
        canManage,
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
    } = useAdminSchoolCalendarController(theme);

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
                />

                <div className="calendar-layout-grid">
                    <CalendarMonthPanel
                        currentMonth={currentMonth}
                        selectedDate={selectedDate}
                        monthGridCells={monthGridCells}
                        selectedDayEvents={selectedDayEvents}
                        categoryStyles={categoryStyles}
                        dayStylesByKey={dayStylesByKey}
                        onPreviousMonth={goToPreviousMonth}
                        onNextMonth={goToNextMonth}
                        onSelectDate={setSelectedDate}
                        getDayCellStyle={getDayCellStyle}
                    />

                    <CalendarUpcomingPanel
                        upcomingLoading={upcomingLoading}
                        monthLoading={monthLoading}
                        upcomingEvents={upcomingEvents}
                        categoryStyles={categoryStyles}
                        preferences={preferences}
                        canManage={canManage}
                        isEventNotificationEnabled={isEventNotificationEnabled}
                        onToggleNotification={handleNotificationToggle}
                        onOpenEventMenu={openEventActionsMenu}
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
            />

            <CalendarEventActionsMenu
                anchorEl={menuAnchor}
                onClose={closeEventActionsMenu}
                onEdit={handleEditFromMenu}
                onCancel={handleCancelFromMenu}
            />
        </div>
    );
};

export default AdminSchoolCalendarPage;
