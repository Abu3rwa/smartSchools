import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../config/api';

// Async thunks
export const addDailyGrade = createAsyncThunk(
    'grades/addDaily',
    async (gradeData, { rejectWithValue }) => {
        try {
            const response = await api.post('/grades/daily', gradeData);
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to add grade');
        }
    }
);

export const bulkAddGrades = createAsyncThunk(
    'grades/bulkAdd',
    async (gradesData, { rejectWithValue }) => {
        try {
            const response = await api.post('/grades/bulk', gradesData);
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to add grades');
        }
    }
);

export const bulkUpdateGrades = createAsyncThunk(
    'grades/bulkUpdate',
    async (gradesData, { rejectWithValue }) => {
        try {
            const response = await api.put('/grades/bulk', gradesData);
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to update grades');
        }
    }
);

export const fetchGradesByAssessmentGroup = createAsyncThunk(
    'grades/fetchByGroup',
    async (assessmentGroupId, { rejectWithValue }) => {
        try {
            const response = await api.get(`/grades/by-group/${assessmentGroupId}`);
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to fetch grades');
        }
    }
);

export const fetchStudentGrades = createAsyncThunk(
    'grades/fetchStudentGrades',
    async ({ studentId, filters = {} }, { rejectWithValue }) => {
        try {
            const response = await api.get(`/grades/student/${studentId}`, { params: filters });
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to fetch grades');
        }
    }
);

export const fetchStudentGradeReport = createAsyncThunk(
    'grades/fetchReport',
    async ({ studentId, academicYear }, { rejectWithValue }) => {
        try {
            const response = await api.get(`/grades/report/${studentId}`, { params: { academicYear } });
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to fetch report');
        }
    }
);

export const fetchClassGrades = createAsyncThunk(
    'grades/fetchClassGrades',
    async ({ classId, subject, date }, { rejectWithValue }) => {
        try {
            const response = await api.get(`/grades/class/${classId}`, { params: { subject, date } });
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to fetch class grades');
        }
    }
);

export const fetchMonthlyAverage = createAsyncThunk(
    'grades/fetchMonthlyAverage',
    async ({ studentId, subject, month, academicYear }, { rejectWithValue }) => {
        try {
            const response = await api.get(`/grades/average/monthly/${studentId}`, {
                params: { subject, month, academicYear }
            });
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to fetch average');
        }
    }
);

export const fetchSemesterAverage = createAsyncThunk(
    'grades/fetchSemesterAverage',
    async ({ studentId, subject, semester, academicYear }, { rejectWithValue }) => {
        try {
            const response = await api.get(`/grades/average/semester/${studentId}`, {
                params: { subject, semester, academicYear }
            });
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to fetch average');
        }
    }
);

export const fetchOverallAverage = createAsyncThunk(
    'grades/fetchOverallAverage',
    async ({ studentId, academicYear }, { rejectWithValue }) => {
        try {
            const response = await api.get(`/grades/average/overall/${studentId}`, {
                params: { academicYear }
            });
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to fetch average');
        }
    }
);

export const updateGrade = createAsyncThunk(
    'grades/update',
    async ({ id, data }, { rejectWithValue }) => {
        try {
            const response = await api.put(`/grades/${id}`, data);
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to update grade');
        }
    }
);

export const deleteGrade = createAsyncThunk(
    'grades/delete',
    async (id, { rejectWithValue }) => {
        try {
            await api.delete(`/grades/${id}`);
            return id;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to delete grade');
        }
    }
);

const gradeSlice = createSlice({
    name: 'grades',
    initialState: {
        studentGrades: [],
        classGrades: [],
        ungradedStudents: [],
        gradeReport: null,
        averages: {
            monthly: null,
            semester: null,
            overall: null
        },
        loading: false,
        submitting: false,
        error: null
    },
    reducers: {
        clearGrades: (state) => {
            state.studentGrades = [];
            state.classGrades = [];
            state.ungradedStudents = [];
        },
        clearReport: (state) => {
            state.gradeReport = null;
        },
        clearError: (state) => {
            state.error = null;
        }
    },
    extraReducers: (builder) => {
        builder
            // Add daily grade
            .addCase(addDailyGrade.pending, (state) => {
                state.submitting = true;
                state.error = null;
            })
            .addCase(addDailyGrade.fulfilled, (state, action) => {
                state.submitting = false;
                state.studentGrades.unshift(action.payload.grade);
            })
            .addCase(addDailyGrade.rejected, (state, action) => {
                state.submitting = false;
                state.error = action.payload;
            })
            // Bulk add grades
            .addCase(bulkAddGrades.pending, (state) => {
                state.submitting = true;
            })
            .addCase(bulkAddGrades.fulfilled, (state) => {
                state.submitting = false;
            })
            .addCase(bulkAddGrades.rejected, (state, action) => {
                state.submitting = false;
                state.error = action.payload;
            })
            // Bulk update grades
            .addCase(bulkUpdateGrades.pending, (state) => {
                state.submitting = true;
            })
            .addCase(bulkUpdateGrades.fulfilled, (state) => {
                state.submitting = false;
            })
            .addCase(bulkUpdateGrades.rejected, (state, action) => {
                state.submitting = false;
                state.error = action.payload;
            })
            // Fetch grades by assessment group
            .addCase(fetchGradesByAssessmentGroup.pending, (state) => {
                state.loading = true;
            })
            .addCase(fetchGradesByAssessmentGroup.fulfilled, (state) => {
                state.loading = false;
            })
            .addCase(fetchGradesByAssessmentGroup.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            // Fetch student grades
            .addCase(fetchStudentGrades.pending, (state) => {
                state.loading = true;
            })
            .addCase(fetchStudentGrades.fulfilled, (state, action) => {
                state.loading = false;
                state.studentGrades = action.payload.grades;
            })
            .addCase(fetchStudentGrades.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            // Fetch grade report
            .addCase(fetchStudentGradeReport.pending, (state) => {
                state.loading = true;
            })
            .addCase(fetchStudentGradeReport.fulfilled, (state, action) => {
                state.loading = false;
                state.gradeReport = action.payload;
            })
            .addCase(fetchStudentGradeReport.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            // Fetch class grades
            .addCase(fetchClassGrades.pending, (state) => {
                state.loading = true;
            })
            .addCase(fetchClassGrades.fulfilled, (state, action) => {
                state.loading = false;
                state.classGrades = action.payload.grades;
                state.ungradedStudents = action.payload.ungradedStudents;
            })
            .addCase(fetchClassGrades.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            // Averages
            .addCase(fetchMonthlyAverage.fulfilled, (state, action) => {
                state.averages.monthly = action.payload.average;
            })
            .addCase(fetchSemesterAverage.fulfilled, (state, action) => {
                state.averages.semester = action.payload.average;
            })
            .addCase(fetchOverallAverage.fulfilled, (state, action) => {
                state.averages.overall = action.payload.average;
            })
            // Update grade
            .addCase(updateGrade.fulfilled, (state, action) => {
                const index = state.studentGrades.findIndex(g => g._id === action.payload.grade._id);
                if (index !== -1) {
                    state.studentGrades[index] = action.payload.grade;
                }
            })
            // Delete grade
            .addCase(deleteGrade.fulfilled, (state, action) => {
                state.studentGrades = state.studentGrades.filter(g => g._id !== action.payload);
            });
    }
});

export const { clearGrades, clearReport, clearError } = gradeSlice.actions;

// Selectors
export const selectStudentGrades = (state) => state.grades.studentGrades;
export const selectClassGrades = (state) => state.grades.classGrades;
export const selectUngradedStudents = (state) => state.grades.ungradedStudents;
export const selectGradeReport = (state) => state.grades.gradeReport;
export const selectAverages = (state) => state.grades.averages;
export const selectGradesLoading = (state) => state.grades.loading;
export const selectGradesSubmitting = (state) => state.grades.submitting;

export default gradeSlice.reducer;
