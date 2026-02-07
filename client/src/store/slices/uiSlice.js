import { createSlice } from '@reduxjs/toolkit';

const uiSlice = createSlice({
    name: 'ui',
    initialState: {
        sidebarOpen: true,
        theme: localStorage.getItem('theme') || 'dark',
        currentAcademicYear: '2025-2026',
        selectedClass: null,
        selectedSubject: null,
        selectedMonth: new Date().getMonth() + 1,
        selectedSemester: new Date().getMonth() >= 7 ? 1 : 2,
        modalOpen: null,
        loading: {}
    },
    reducers: {
        toggleSidebar: (state) => {
            state.sidebarOpen = !state.sidebarOpen;
        },
        setSidebarOpen: (state, action) => {
            state.sidebarOpen = action.payload;
        },
        setTheme: (state, action) => {
            state.theme = action.payload;
            localStorage.setItem('theme', action.payload);
        },
        setCurrentAcademicYear: (state, action) => {
            state.currentAcademicYear = action.payload;
        },
        setSelectedClass: (state, action) => {
            state.selectedClass = action.payload;
        },
        setSelectedSubject: (state, action) => {
            state.selectedSubject = action.payload;
        },
        setSelectedMonth: (state, action) => {
            state.selectedMonth = action.payload;
        },
        setSelectedSemester: (state, action) => {
            state.selectedSemester = action.payload;
        },
        openModal: (state, action) => {
            state.modalOpen = action.payload;
        },
        closeModal: (state) => {
            state.modalOpen = null;
        },
        setLoading: (state, action) => {
            state.loading[action.payload.key] = action.payload.value;
        }
    }
});

export const {
    toggleSidebar,
    setSidebarOpen,
    setTheme,
    setCurrentAcademicYear,
    setSelectedClass,
    setSelectedSubject,
    setSelectedMonth,
    setSelectedSemester,
    openModal,
    closeModal,
    setLoading
} = uiSlice.actions;

// Selectors
export const selectSidebarOpen = (state) => state.ui.sidebarOpen;
export const selectTheme = (state) => state.ui.theme;
export const selectCurrentAcademicYear = (state) => state.ui.currentAcademicYear;
export const selectSelectedClass = (state) => state.ui.selectedClass;
export const selectSelectedSubject = (state) => state.ui.selectedSubject;
export const selectSelectedMonth = (state) => state.ui.selectedMonth;
export const selectSelectedSemester = (state) => state.ui.selectedSemester;
export const selectModalOpen = (state) => state.ui.modalOpen;

export default uiSlice.reducer;
