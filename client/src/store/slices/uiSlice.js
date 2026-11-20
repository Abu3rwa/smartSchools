import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../config/api';
import { landingPageDefaults } from '../../config/landingPageDefaults';
import {
    inferAcademicYear,
    inferSemester,
    retireLegacyPeriodPrefs,
    applySchoolPeriod,
} from '../../utils/schoolPeriod';

const SUPPORTED_LANGUAGES = ['en', 'ar'];
const DEFAULT_APP_NAME = landingPageDefaults?.brand?.name || 'School Platform';

const getInitialLanguage = () => {
    const hasWindow = typeof window !== 'undefined';
    const storedLanguage = hasWindow ? localStorage.getItem('app.lang') : null;
    if (storedLanguage && SUPPORTED_LANGUAGES.includes(storedLanguage)) {
        return storedLanguage;
    }

    const browserLanguage = typeof navigator !== 'undefined'
        ? navigator?.language?.split('-')?.[0]?.toLowerCase()
        : null;
    if (browserLanguage && SUPPORTED_LANGUAGES.includes(browserLanguage)) {
        return browserLanguage;
    }

    return 'en';
};

if (typeof window !== 'undefined') retireLegacyPeriodPrefs(localStorage);

const getInitialAcademicYear = () => inferAcademicYear();

const getInitialSemester = () => inferSemester();

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

export const fetchSchoolAcademicPeriod = createAsyncThunk(
    'ui/fetchSchoolAcademicPeriod',
    async (_, { rejectWithValue }) => {
        try {
            const response = await api.get('/schools/me/active-academic-period');
            return response.data?.data || null;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to load school academic period');
        }
    }
);

export const updateSchoolAcademicPeriod = createAsyncThunk(
    'ui/updateSchoolAcademicPeriod',
    async ({ academicYear, semester }, { rejectWithValue }) => {
        try {
            const response = await api.put('/schools/me/active-academic-period', { academicYear, semester });
            return response.data?.data || null;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to update school academic period');
        }
    }
);

export const fetchAppName = createAsyncThunk(
    'ui/fetchAppName',
    async (_, { rejectWithValue }) => {
        try {
            const response = await api.get('/landing/content');
            return response.data?.data?.content?.brand?.name || DEFAULT_APP_NAME;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to load app name');
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

export const fetchAvailableYears = createAsyncThunk(
    'ui/fetchAvailableYears',
    async (_, { rejectWithValue }) => {
        try {
            const response = await api.get('/schools/me/academic-years');
            return response.data?.data || { academicYears: [], currentAcademicYear: null };
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to load available years');
        }
    }
);

const getInitialSidebarOpen = () => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('sidebarOpen') !== 'false';
};

const uiSlice = createSlice({
    name: 'ui',
    initialState: {
        sidebarOpen: getInitialSidebarOpen(),
        theme: localStorage.getItem('theme') || 'light',
        appName: DEFAULT_APP_NAME,
        language: getInitialLanguage(),
        currentAcademicYear: getInitialAcademicYear(),
        academicYearLoading: false,
        academicYearError: null,
        selectedClass: null,
        selectedSubject: null,
        selectedMonth: new Date().getMonth() + 1,
        selectedSemester: getInitialSemester(),
        availableYears: [],
        availableYearsLoading: false,
        schoolCurrentYear: null,
        schoolCurrentSemester: null,
        modalOpen: null,
        loading: {}
    },
    reducers: {
        toggleSidebar: (state) => {
            state.sidebarOpen = !state.sidebarOpen;
            localStorage.setItem('sidebarOpen', state.sidebarOpen ? 'true' : 'false');
        },
        setSidebarOpen: (state, action) => {
            state.sidebarOpen = action.payload;
            // Only an explicit expand is remembered: mobile closes the drawer on every route change
            if (action.payload) localStorage.setItem('sidebarOpen', 'true');
        },
        setTheme: (state, action) => {
            state.theme = action.payload;
            localStorage.setItem('theme', action.payload);
        },
        setLanguage: (state, action) => {
            if (!SUPPORTED_LANGUAGES.includes(action.payload)) return;
            state.language = action.payload;
            localStorage.setItem('app.lang', action.payload);
        },
        setCurrentAcademicYear: (state, action) => {
            state.currentAcademicYear = action.payload;
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
                    state.schoolCurrentYear = action.payload;
                }
            })
            .addCase(fetchSchoolAcademicYear.rejected, (state, action) => {
                state.academicYearLoading = false;
                state.academicYearError = action.payload;
            })
            .addCase(fetchSchoolAcademicPeriod.pending, (state) => {
                state.academicYearLoading = true;
                state.academicYearError = null;
            })
            .addCase(fetchSchoolAcademicPeriod.fulfilled, (state, action) => {
                state.academicYearLoading = false;
                applySchoolPeriod(state, action.payload);
            })
            .addCase(fetchSchoolAcademicPeriod.rejected, (state, action) => {
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
                    state.schoolCurrentYear = action.payload;
                }
            })
            .addCase(updateSchoolAcademicYear.rejected, (state, action) => {
                state.academicYearLoading = false;
                state.academicYearError = action.payload;
            })
            .addCase(updateSchoolAcademicPeriod.pending, (state) => {
                state.academicYearLoading = true;
                state.academicYearError = null;
            })
            .addCase(updateSchoolAcademicPeriod.fulfilled, (state, action) => {
                state.academicYearLoading = false;
                applySchoolPeriod(state, action.payload);
            })
            .addCase(updateSchoolAcademicPeriod.rejected, (state, action) => {
                state.academicYearLoading = false;
                state.academicYearError = action.payload;
            })
            .addCase(fetchAppName.fulfilled, (state, action) => {
                if (action.payload) {
                    state.appName = action.payload;
                }
            })
            .addCase(fetchAvailableYears.pending, (state) => {
                state.availableYearsLoading = true;
            })
            .addCase(fetchAvailableYears.fulfilled, (state, action) => {
                state.availableYearsLoading = false;
                state.availableYears = action.payload.academicYears || [];
                if (action.payload.currentAcademicYear) {
                    state.schoolCurrentYear = action.payload.currentAcademicYear;
                }
            })
            .addCase(fetchAvailableYears.rejected, (state) => {
                state.availableYearsLoading = false;
            });
    }
});


export const {
    toggleSidebar,
    setSidebarOpen,
    setTheme,
    setLanguage,
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
export const selectAppName = (state) => state.ui.appName;
export const selectLanguage = (state) => state.ui.language;
export const selectCurrentAcademicYear = (state) => state.ui.currentAcademicYear;
export const selectAcademicYearLoading = (state) => state.ui.academicYearLoading;
export const selectAcademicYearError = (state) => state.ui.academicYearError;
export const selectSelectedClass = (state) => state.ui.selectedClass;
export const selectSelectedSubject = (state) => state.ui.selectedSubject;
export const selectSelectedMonth = (state) => state.ui.selectedMonth;
export const selectSelectedSemester = (state) => state.ui.selectedSemester;
export const selectAvailableYears = (state) => state.ui.availableYears;
export const selectAvailableYearsLoading = (state) => state.ui.availableYearsLoading;
export const selectSchoolCurrentYear = (state) => state.ui.schoolCurrentYear;
export const selectSchoolCurrentSemester = (state) => state.ui.schoolCurrentSemester;
export const selectModalOpen = (state) => state.ui.modalOpen;

export default uiSlice.reducer;
