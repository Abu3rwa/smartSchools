import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../config/api';

// Async thunks
export const fetchTeachers = createAsyncThunk(
    'teachers/fetchTeachers',
    async (params = {}, { rejectWithValue }) => {
        try {
            const response = await api.get('/teachers', { params });
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to fetch teachers');
        }
    }
);

export const fetchTeacher = createAsyncThunk(
    'teachers/fetchTeacher',
    async (id, { rejectWithValue }) => {
        try {
            const response = await api.get(`/teachers/${id}`);
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to fetch teacher');
        }
    }
);

export const fetchMyClasses = createAsyncThunk(
    'teachers/fetchMyClasses',
    async (_, { rejectWithValue }) => {
        try {
            const response = await api.get('/teachers/my-classes');
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to fetch classes');
        }
    }
);

export const createTeacher = createAsyncThunk(
    'teachers/createTeacher',
    async (teacherData, { rejectWithValue }) => {
        try {
            const response = await api.post('/teachers', teacherData);
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to create teacher');
        }
    }
);

export const assignMultipleClassesToTeacher = createAsyncThunk(
    'teachers/assignMultipleClasses',
    async ({ teacherId, assignments }, { rejectWithValue, dispatch }) => {
        try {
            const response = await api.post(`/teachers/${teacherId}/assign-classes`, {
                assignments
            });
            // Refresh classes so classSlice stays in sync
            dispatch({ type: 'classes/needsRefresh' });
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to assign classes');
        }
    }
);

export const removeClassFromTeacher = createAsyncThunk(
    'teachers/removeClass',
    async ({ teacherId, assignmentId }, { rejectWithValue, dispatch }) => {
        try {
            const response = await api.delete(`/teachers/${teacherId}/remove-class/${assignmentId}`);
            // Refresh classes so classSlice stays in sync
            dispatch({ type: 'classes/needsRefresh' });
            return {
                teacherId,
                assignmentId,
                teacher: response.data?.data?.teacher
            };
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to remove class assignment');
        }
    }
);

export const sendTeacherLoginInvite = createAsyncThunk(
    'teachers/sendTeacherLoginInvite',
    async (teacherId, { rejectWithValue }) => {
        try {
            const response = await api.post(`/teachers/${teacherId}/send-login-invite`);
            return response.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to send teacher invite');
        }
    }
);

export const bulkSendTeacherLoginInvites = createAsyncThunk(
    'teachers/bulkSendTeacherLoginInvites',
    async (teacherIds, { rejectWithValue }) => {
        try {
            const response = await api.post('/teachers/bulk-send-login-invites', { teacherIds });
            return response.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to send teacher invites');
        }
    }
);

export const updateTeacher = createAsyncThunk(
    'teachers/updateTeacher',
    async ({ id, teacherData }, { rejectWithValue }) => {
        try {
            const response = await api.put(`/teachers/${id}`, teacherData);
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to update teacher');
        }
    }
);

export const deleteTeacher = createAsyncThunk(
    'teachers/deleteTeacher',
    async (id, { rejectWithValue }) => {
        try {
            await api.delete(`/teachers/${id}`);
            return id;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to delete teacher');
        }
    }
);

const teacherSlice = createSlice({
    name: 'teachers',
    initialState: {
        teachers: [],
        pagination: null,
        currentTeacher: null,
        myClasses: [],
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
            .addCase(fetchTeachers.pending, (state) => {
                state.loading = true;
            })
            .addCase(fetchTeachers.fulfilled, (state, action) => {
                state.loading = false;
                state.teachers = action.payload?.teachers || [];
                state.pagination = action.payload?.pagination || null;
            })
            .addCase(fetchTeachers.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            .addCase(fetchTeacher.fulfilled, (state, action) => {
                state.currentTeacher = action.payload.teacher;
            })
            .addCase(fetchMyClasses.fulfilled, (state, action) => {
                state.myClasses = action.payload.classes;
            })
            .addCase(createTeacher.fulfilled, (state, action) => {
                state.teachers.push(action.payload.teacher);
            })
            .addCase(assignMultipleClassesToTeacher.fulfilled, (state, action) => {
                // Update the teacher in the list
                const index = state.teachers.findIndex(t => t._id === action.payload.teacher._id);
                if (index !== -1) {
                    state.teachers[index] = action.payload.teacher;
                }
                state.currentTeacher = action.payload.teacher;
            })
            .addCase(removeClassFromTeacher.fulfilled, (state, action) => {
                const nextTeacher = action.payload.teacher;
                const index = state.teachers.findIndex(t => t._id === action.payload.teacherId);

                if (index !== -1) {
                    if (nextTeacher) {
                        state.teachers[index] = nextTeacher;
                    } else {
                        state.teachers[index].assignedClasses = state.teachers[index].assignedClasses.filter(
                            ac => ac._id.toString() !== action.payload.assignmentId
                        );
                    }
                }

                if (state.currentTeacher?._id === action.payload.teacherId) {
                    state.currentTeacher = nextTeacher || {
                        ...state.currentTeacher,
                        assignedClasses: state.currentTeacher.assignedClasses.filter(
                            ac => ac._id.toString() !== action.payload.assignmentId
                        )
                    };
                }
            })
            .addCase(updateTeacher.fulfilled, (state, action) => {
                // Update the teacher in the list
                const index = state.teachers.findIndex(t => t._id === action.payload.teacher._id);
                if (index !== -1) {
                    state.teachers[index] = action.payload.teacher;
                }
                state.currentTeacher = action.payload.teacher;
            })
            .addCase(deleteTeacher.fulfilled, (state, action) => {
                // Remove teacher from the list
                state.teachers = state.teachers.filter(t => t._id !== action.payload);
                if (state.currentTeacher?._id === action.payload) {
                    state.currentTeacher = null;
                }
            });
    }
});

export const { clearError } = teacherSlice.actions;

export const selectTeachers = (state) => state.teachers.teachers;
export const selectTeachersPagination = (state) => state.teachers.pagination;
export const selectCurrentTeacher = (state) => state.teachers.currentTeacher;
export const selectMyClasses = (state) => state.teachers.myClasses;
export const selectTeachersLoading = (state) => state.teachers.loading;

export default teacherSlice.reducer;
