import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../config/api';

const DEFAULT_ACADEMIC_YEAR_START_MONTH = 8;
const inferAcademicYear = () => {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const startYear = currentMonth >= DEFAULT_ACADEMIC_YEAR_START_MONTH
        ? now.getFullYear()
        : now.getFullYear() - 1;
    return `${startYear}-${startYear + 1}`;
};

const getInitialAcademicYear = () => localStorage.getItem('currentAcademicYear') || inferAcademicYear();

export const fetchSchoolAcademicYear = createAsyncThunk(
    'ui/fetchSchoolAcademicYear',
    async (_, { rejectWithValue }) => {
        try {
            const response = await api.get('/schools/me/current-academic-year');
            return response.data?.data?.academicYear;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to load school academic year');
        }
    }
);

export const updateSchoolAcademicYear = createAsyncThunk(
    'ui/updateSchoolAcademicYear',
    async (academicYear, { rejectWithValue }) => {
        try {
            const response = await api.put('/schools/me/current-academic-year', { academicYear });
            return response.data?.data?.academicYear;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to update school academic year');
        }
    }
);

const uiSlice = createSlice({
    name: 'ui',
    initialState: {
        sidebarOpen: true,
        theme: localStorage.getItem('theme') || 'dark',
        currentAcademicYear: getInitialAcademicYear(),
        academicYearLoading: false,
        academicYearError: null,
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
            localStorage.setItem('currentAcademicYear', action.payload);
            state.academicYearError = null;
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
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchSchoolAcademicYear.pending, (state) => {
                state.academicYearLoading = true;
                state.academicYearError = null;
            })
            .addCase(fetchSchoolAcademicYear.fulfilled, (state, action) => {
                state.academicYearLoading = false;
                if (action.payload) {
                    state.currentAcademicYear = action.payload;
                    localStorage.setItem('currentAcademicYear', action.payload);
                }
            })
            .addCase(fetchSchoolAcademicYear.rejected, (state, action) => {
                state.academicYearLoading = false;
                state.academicYearError = action.payload;
            })
            .addCase(updateSchoolAcademicYear.pending, (state) => {
                state.academicYearLoading = true;
                state.academicYearError = null;
            })
            .addCase(updateSchoolAcademicYear.fulfilled, (state, action) => {
                state.academicYearLoading = false;
                if (action.payload) {
                    state.currentAcademicYear = action.payload;
                    localStorage.setItem('currentAcademicYear', action.payload);
                }
            })
            .addCase(updateSchoolAcademicYear.rejected, (state, action) => {
                state.academicYearLoading = false;
                state.academicYearError = action.payload;
            });
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
export const selectAcademicYearLoading = (state) => state.ui.academicYearLoading;
export const selectAcademicYearError = (state) => state.ui.academicYearError;
export const selectSelectedClass = (state) => state.ui.selectedClass;
export const selectSelectedSubject = (state) => state.ui.selectedSubject;
export const selectSelectedMonth = (state) => state.ui.selectedMonth;
export const selectSelectedSemester = (state) => state.ui.selectedSemester;
export const selectModalOpen = (state) => state.ui.modalOpen;

export default uiSlice.reducer;
