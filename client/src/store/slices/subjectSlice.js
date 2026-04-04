import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../config/api';

// Async thunks
export const fetchSubjects = createAsyncThunk(
    'subjects/fetchSubjects',
    async (params = {}, { rejectWithValue }) => {
        try {
            const response = await api.get('/subjects', { params });
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to fetch subjects');
        }
    }
);

export const fetchSubjectsByGrade = createAsyncThunk(
    'subjects/fetchByGrade',
    async (grade, { rejectWithValue }) => {
        try {
            const response = await api.get(`/subjects/grade/${grade}`);
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to fetch subjects');
        }
    }
);

export const createSubject = createAsyncThunk(
    'subjects/createSubject',
    async (subjectData, { rejectWithValue }) => {
        try {
            const response = await api.post('/subjects', subjectData);
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to create subject');
        }
    }
);

export const updateSubject = createAsyncThunk(
    'subjects/updateSubject',
    async ({ id, data }, { rejectWithValue }) => {
        try {
            const response = await api.put(`/subjects/${id}`, data);
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to update subject');
        }
    }
);

export const deleteSubject = createAsyncThunk(
    'subjects/deleteSubject',
    async (id, { rejectWithValue }) => {
        try {
            await api.delete(`/subjects/${id}`);
            return id;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to delete subject');
        }
    }
);

const subjectSlice = createSlice({
    name: 'subjects',
    initialState: {
        subjects: [],
        pagination: null,
        gradeSubjects: [],
        loading: false,
        error: null
    },
    reducers: {
        clearError: (state) => {
            state.error = null;
        }
    },
    extraReducers: (builder) => {
        builder
            // Fetch subjects
            .addCase(fetchSubjects.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchSubjects.fulfilled, (state, action) => {
                state.loading = false;
                state.subjects = action.payload?.subjects || [];
                state.pagination = action.payload?.pagination || null;
            })
            .addCase(fetchSubjects.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            // Fetch by grade
            .addCase(fetchSubjectsByGrade.fulfilled, (state, action) => {
                state.gradeSubjects = action.payload.subjects;
            })
            // Create subject
            .addCase(createSubject.fulfilled, (state, action) => {
                state.subjects.push(action.payload.subject);
            })
            // Update subject
            .addCase(updateSubject.fulfilled, (state, action) => {
                const index = state.subjects.findIndex(s => s._id === action.payload.subject._id);
                if (index !== -1) {
                    state.subjects[index] = action.payload.subject;
                }
            })
            // Delete subject
            .addCase(deleteSubject.fulfilled, (state, action) => {
                state.subjects = state.subjects.filter(s => s._id !== action.payload);
            });
    }
});

export const { clearError } = subjectSlice.actions;

// Selectors
export const selectSubjects = (state) => state.subjects.subjects;
export const selectSubjectsPagination = (state) => state.subjects.pagination;
export const selectGradeSubjects = (state) => state.subjects.gradeSubjects;
export const selectSubjectsLoading = (state) => state.subjects.loading;
export const selectSubjectsError = (state) => state.subjects.error;

export default subjectSlice.reducer;
