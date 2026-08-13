import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../config/api';

// ─── Units ─────────────────────────────────────────────────────────────────

export const fetchUnits = createAsyncThunk('socialStudies/fetchUnits', async (params = {}, { rejectWithValue }) => {
    try {
        const res = await api.get('/social-studies/units', { params });
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to load units'); }
});

export const createUnit = createAsyncThunk('socialStudies/createUnit', async (data, { rejectWithValue }) => {
    try {
        const res = await api.post('/social-studies/units', data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to create unit'); }
});

export const updateUnit = createAsyncThunk('socialStudies/updateUnit', async ({ id, data }, { rejectWithValue }) => {
    try {
        const res = await api.put(`/social-studies/units/${id}`, data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to update unit'); }
});

export const deleteUnit = createAsyncThunk('socialStudies/deleteUnit', async (id, { rejectWithValue }) => {
    try {
        await api.delete(`/social-studies/units/${id}`);
        return id;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to delete unit'); }
});

// ─── Lessons ───────────────────────────────────────────────────────────────

export const fetchLessons = createAsyncThunk('socialStudies/fetchLessons', async (unitId, { rejectWithValue }) => {
    try {
        const res = await api.get('/social-studies/lessons', { params: { unitId } });
        return { unitId, lessons: res.data.data };
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to load lessons'); }
});

export const fetchLesson = createAsyncThunk('socialStudies/fetchLesson', async (id, { rejectWithValue }) => {
    try {
        const res = await api.get(`/social-studies/lessons/${id}`);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to load lesson'); }
});

export const fetchLessonForStudent = createAsyncThunk('socialStudies/fetchLessonForStudent', async (id, { rejectWithValue }) => {
    try {
        const res = await api.get(`/social-studies/lessons/${id}/student`);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to load lesson'); }
});

export const createLesson = createAsyncThunk('socialStudies/createLesson', async (data, { rejectWithValue }) => {
    try {
        const res = await api.post('/social-studies/lessons', data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to create lesson'); }
});

export const updateLesson = createAsyncThunk('socialStudies/updateLesson', async ({ id, data }, { rejectWithValue }) => {
    try {
        const res = await api.put(`/social-studies/lessons/${id}`, data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to update lesson'); }
});

export const deleteLesson = createAsyncThunk('socialStudies/deleteLesson', async (id, { rejectWithValue }) => {
    try {
        await api.delete(`/social-studies/lessons/${id}`);
        return id;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to delete lesson'); }
});

export const generateAIQuestions = createAsyncThunk('socialStudies/generateAIQuestions', async ({ lessonId, count, difficulty, questionTypes }, { rejectWithValue }) => {
    try {
        const res = await api.post(`/social-studies/lessons/${lessonId}/generate-questions`, { count, difficulty, questionTypes });
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'AI generation failed'); }
});

// ─── Assignments ───────────────────────────────────────────────────────────

export const fetchAssignments = createAsyncThunk('socialStudies/fetchAssignments', async (params = {}, { rejectWithValue }) => {
    try {
        const res = await api.get('/social-studies/assignments', { params });
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to load assignments'); }
});

export const fetchStudentAssignments = createAsyncThunk('socialStudies/fetchStudentAssignments', async (params = {}, { rejectWithValue }) => {
    try {
        const res = await api.get('/social-studies/assignments/student', { params });
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to load your assignments'); }
});

export const createAssignment = createAsyncThunk('socialStudies/createAssignment', async (data, { rejectWithValue }) => {
    try {
        const res = await api.post('/social-studies/assignments', data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to create assignment'); }
});

export const updateAssignment = createAsyncThunk('socialStudies/updateAssignment', async ({ id, data }, { rejectWithValue }) => {
    try {
        const res = await api.put(`/social-studies/assignments/${id}`, data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to update assignment'); }
});

export const publishAssignment = createAsyncThunk('socialStudies/publishAssignment', async (id, { rejectWithValue }) => {
    try {
        const res = await api.post(`/social-studies/assignments/${id}/publish`);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to publish assignment'); }
});

export const closeAssignment = createAsyncThunk('socialStudies/closeAssignment', async (id, { rejectWithValue }) => {
    try {
        const res = await api.patch(`/social-studies/assignments/${id}/close`);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to close assignment'); }
});

export const deleteAssignment = createAsyncThunk('socialStudies/deleteAssignment', async (id, { rejectWithValue }) => {
    try {
        await api.delete(`/social-studies/assignments/${id}`);
        return id;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to delete assignment'); }
});

export const fetchAssignmentResults = createAsyncThunk('socialStudies/fetchAssignmentResults', async (id, { rejectWithValue }) => {
    try {
        const res = await api.get(`/social-studies/assignments/${id}/results`);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to load results'); }
});

// ─── Submissions ───────────────────────────────────────────────────────────

export const startSubmission = createAsyncThunk('socialStudies/startSubmission', async (assignmentId, { rejectWithValue }) => {
    try {
        const res = await api.post('/social-studies/submissions/start', { assignmentId });
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to start'); }
});

export const submitSubmission = createAsyncThunk('socialStudies/submitSubmission', async ({ id, answers }, { rejectWithValue }) => {
    try {
        const res = await api.put(`/social-studies/submissions/${id}/submit`, { answers });
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to submit'); }
});

export const fetchMySubmissions = createAsyncThunk('socialStudies/fetchMySubmissions', async (_, { rejectWithValue }) => {
    try {
        const res = await api.get('/social-studies/submissions/my');
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to load submissions'); }
});

export const gradeSubmission = createAsyncThunk('socialStudies/gradeSubmission', async ({ id, questionGrades }, { rejectWithValue }) => {
    try {
        const res = await api.put(`/social-studies/submissions/${id}/grade`, { questionGrades });
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to grade submission'); }
});

// ─── Slice ─────────────────────────────────────────────────────────────────

const socialStudiesSlice = createSlice({
    name: 'socialStudies',
    initialState: {
        units: [],
        unitsLoading: false,
        unitsError: null,

        lessonsByUnit: {},       // { unitId: [lesson, ...] }
        lessonsLoading: false,

        activeLesson: null,      // full lesson with blocks + questions
        activeLessonLoading: false,

        assignments: [],
        assignmentsLoading: false,

        studentAssignments: [],
        studentAssignmentsLoading: false,

        activeResults: null,
        resultsLoading: false,

        activeSubmission: null,
        submitting: false,

        aiGenerating: false,
        aiDraftQuestions: [],

        mySubmissions: [],
        mySubmissionsLoading: false,

        error: null,
    },
    reducers: {
        clearActiveLesson(state) { state.activeLesson = null; },
        clearActiveSubmission(state) { state.activeSubmission = null; },
        clearAIDraftQuestions(state) { state.aiDraftQuestions = []; },
        clearError(state) { state.error = null; },
    },
    extraReducers: (builder) => {
        // Units
        builder
            .addCase(fetchUnits.pending, (state) => { state.unitsLoading = true; state.unitsError = null; })
            .addCase(fetchUnits.fulfilled, (state, action) => { state.unitsLoading = false; state.units = action.payload; })
            .addCase(fetchUnits.rejected, (state, action) => { state.unitsLoading = false; state.unitsError = action.payload; })
            .addCase(createUnit.fulfilled, (state, action) => { state.units.unshift(action.payload); })
            .addCase(updateUnit.fulfilled, (state, action) => {
                const idx = state.units.findIndex(u => u._id === action.payload._id);
                if (idx !== -1) state.units[idx] = action.payload;
            })
            .addCase(deleteUnit.fulfilled, (state, action) => {
                state.units = state.units.filter(u => u._id !== action.payload);
            });

        // Lessons
        builder
            .addCase(fetchLessons.pending, (state) => { state.lessonsLoading = true; })
            .addCase(fetchLessons.fulfilled, (state, action) => {
                state.lessonsLoading = false;
                state.lessonsByUnit[action.payload.unitId] = action.payload.lessons;
            })
            .addCase(fetchLessons.rejected, (state) => { state.lessonsLoading = false; })
            .addCase(fetchLesson.pending, (state) => { state.activeLessonLoading = true; })
            .addCase(fetchLesson.fulfilled, (state, action) => { state.activeLessonLoading = false; state.activeLesson = action.payload; })
            .addCase(fetchLesson.rejected, (state) => { state.activeLessonLoading = false; })
            .addCase(fetchLessonForStudent.pending, (state) => { state.activeLessonLoading = true; })
            .addCase(fetchLessonForStudent.fulfilled, (state, action) => { state.activeLessonLoading = false; state.activeLesson = action.payload; })
            .addCase(fetchLessonForStudent.rejected, (state) => { state.activeLessonLoading = false; })
            .addCase(createLesson.fulfilled, (state, action) => {
                const unitId = action.payload.unit;
                if (state.lessonsByUnit[unitId]) state.lessonsByUnit[unitId].push(action.payload);
            })
            .addCase(updateLesson.fulfilled, (state, action) => {
                if (state.activeLesson?._id === action.payload._id) state.activeLesson = action.payload;
                const unitId = action.payload.unit;
                if (state.lessonsByUnit[unitId]) {
                    const idx = state.lessonsByUnit[unitId].findIndex(l => l._id === action.payload._id);
                    if (idx !== -1) state.lessonsByUnit[unitId][idx] = action.payload;
                }
            })
            .addCase(deleteLesson.fulfilled, (state, action) => {
                for (const unitId of Object.keys(state.lessonsByUnit)) {
                    state.lessonsByUnit[unitId] = state.lessonsByUnit[unitId].filter(l => l._id !== action.payload);
                }
            });

        // Assignments
        builder
            .addCase(fetchAssignments.pending, (state) => { state.assignmentsLoading = true; })
            .addCase(fetchAssignments.fulfilled, (state, action) => { state.assignmentsLoading = false; state.assignments = action.payload; })
            .addCase(fetchAssignments.rejected, (state) => { state.assignmentsLoading = false; })
            .addCase(fetchStudentAssignments.pending, (state) => { state.studentAssignmentsLoading = true; })
            .addCase(fetchStudentAssignments.fulfilled, (state, action) => { state.studentAssignmentsLoading = false; state.studentAssignments = action.payload; })
            .addCase(fetchStudentAssignments.rejected, (state) => { state.studentAssignmentsLoading = false; })
            .addCase(createAssignment.fulfilled, (state, action) => { state.assignments.unshift(action.payload); })
            .addCase(updateAssignment.fulfilled, (state, action) => {
                const idx = state.assignments.findIndex(a => a._id === action.payload._id);
                if (idx !== -1) state.assignments[idx] = action.payload;
            })
            .addCase(publishAssignment.fulfilled, (state, action) => {
                const idx = state.assignments.findIndex(a => a._id === action.payload._id);
                if (idx !== -1) state.assignments[idx] = action.payload;
            })
            .addCase(closeAssignment.fulfilled, (state, action) => {
                const idx = state.assignments.findIndex(a => a._id === action.payload._id);
                if (idx !== -1) state.assignments[idx] = action.payload;
            })
            .addCase(deleteAssignment.fulfilled, (state, action) => {
                state.assignments = state.assignments.filter(a => a._id !== action.payload);
            })
            .addCase(fetchAssignmentResults.pending, (state) => { state.resultsLoading = true; })
            .addCase(fetchAssignmentResults.fulfilled, (state, action) => { state.resultsLoading = false; state.activeResults = action.payload; })
            .addCase(fetchAssignmentResults.rejected, (state) => { state.resultsLoading = false; });

        // Submissions
        builder
            .addCase(startSubmission.pending, (state) => { state.submitting = true; })
            .addCase(startSubmission.fulfilled, (state, action) => { state.submitting = false; state.activeSubmission = action.payload; })
            .addCase(startSubmission.rejected, (state) => { state.submitting = false; })
            .addCase(submitSubmission.pending, (state) => { state.submitting = true; })
            .addCase(submitSubmission.fulfilled, (state, action) => { state.submitting = false; state.activeSubmission = action.payload; })
            .addCase(submitSubmission.rejected, (state) => { state.submitting = false; })
            .addCase(fetchMySubmissions.pending, (state) => { state.mySubmissionsLoading = true; })
            .addCase(fetchMySubmissions.fulfilled, (state, action) => { state.mySubmissionsLoading = false; state.mySubmissions = action.payload; })
            .addCase(fetchMySubmissions.rejected, (state) => { state.mySubmissionsLoading = false; })
            .addCase(gradeSubmission.fulfilled, (state, action) => {
                if (state.activeResults) {
                    const idx = state.activeResults.submissions?.findIndex(s => s._id === action.payload._id);
                    if (idx !== -1) state.activeResults.submissions[idx] = action.payload;
                }
            });

        // AI generation
        builder
            .addCase(generateAIQuestions.pending, (state) => { state.aiGenerating = true; state.aiDraftQuestions = []; })
            .addCase(generateAIQuestions.fulfilled, (state, action) => { state.aiGenerating = false; state.aiDraftQuestions = action.payload; })
            .addCase(generateAIQuestions.rejected, (state) => { state.aiGenerating = false; });
    },
});

export const { clearActiveLesson, clearActiveSubmission, clearAIDraftQuestions, clearError } = socialStudiesSlice.actions;
// Selectors
export const selectUnits = (state) => state.socialStudies.units;
export const selectUnitsLoading = (state) => state.socialStudies.unitsLoading;
export const selectLessonsByUnit = (unitId) => (state) => state.socialStudies.lessonsByUnit[unitId] || [];
export const selectActiveLesson = (state) => state.socialStudies.activeLesson;
export const selectActiveLessonLoading = (state) => state.socialStudies.activeLessonLoading;
export const selectAssignments = (state) => state.socialStudies.assignments;
export const selectAssignmentsLoading = (state) => state.socialStudies.assignmentsLoading;
export const selectStudentAssignments = (state) => state.socialStudies.studentAssignments;
export const selectStudentAssignmentsLoading = (state) => state.socialStudies.studentAssignmentsLoading;
export const selectActiveResults = (state) => state.socialStudies.activeResults;
export const selectResultsLoading = (state) => state.socialStudies.resultsLoading;
export const selectActiveSubmission = (state) => state.socialStudies.activeSubmission;
export const selectSubmitting = (state) => state.socialStudies.submitting;
export const selectMySubmissions = (state) => state.socialStudies.mySubmissions;
export const selectMySubmissionsLoading = (state) => state.socialStudies.mySubmissionsLoading;
export const selectAIGenerating = (state) => state.socialStudies.aiGenerating;
export const selectAIDraftQuestions = (state) => state.socialStudies.aiDraftQuestions;

export default socialStudiesSlice.reducer;
