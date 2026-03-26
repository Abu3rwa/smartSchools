import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../config/api';
import {
    submitStudentPromotionDecision,
    updateStudentReEnrollment
} from './studentPromotionSlice';

// ─── Student CRUD Thunks ───

export const fetchStudents = createAsyncThunk(
    'students/fetchStudents',
    async (params = {}, { rejectWithValue }) => {
        try {
            const response = await api.get('/students', { params });
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to fetch students');
        }
    }
);

export const fetchStudent = createAsyncThunk(
    'students/fetchStudent',
    async (id, { rejectWithValue }) => {
        try {
            const response = await api.get(`/students/${id}`);
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to fetch student');
        }
    }
);

export const fetchStudentsByClass = createAsyncThunk(
    'students/fetchByClass',
    async (classId, { rejectWithValue }) => {
        try {
            const response = await api.get(`/students/class/${classId}`);
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to fetch students');
        }
    }
);

export const createStudent = createAsyncThunk(
    'students/createStudent',
    async (studentData, { rejectWithValue }) => {
        try {
            const response = await api.post('/students', studentData);
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || error.response?.data?.error || 'Failed to create student');
        }
    }
);

export const updateStudent = createAsyncThunk(
    'students/updateStudent',
    async ({ id, data }, { rejectWithValue }) => {
        try {
            const response = await api.put(`/students/${id}`, data);
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to update student');
        }
    }
);

export const importStudents = createAsyncThunk(
    'students/importStudents',
    async ({ students, classId }, { rejectWithValue }) => {
        try {
            const response = await api.post('/students/import', { students, classId });
            return response.data;
        } catch (error) {
            return rejectWithValue(error.response?.data || { message: 'Failed to import students' });
        }
    }
);

export const deleteStudent = createAsyncThunk(
    'students/deleteStudent',
    async (id, { rejectWithValue }) => {
        try {
            await api.delete(`/students/${id}`);
            return id;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to delete student');
        }
    }
);

// ─── Photo Thunks ───

export const uploadStudentPhoto = createAsyncThunk(
    'students/uploadStudentPhoto',
    async ({ id, file }, { rejectWithValue }) => {
        try {
            const formData = new FormData();
            formData.append('photo', file);
            const response = await api.put(`/students/${id}/photo`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to upload student photo');
        }
    }
);

export const removeStudentPhoto = createAsyncThunk(
    'students/removeStudentPhoto',
    async (id, { rejectWithValue }) => {
        try {
            const response = await api.delete(`/students/${id}/photo`);
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to remove student photo');
        }
    }
);

// ─── Helpers ───

const syncStudentAcrossCollections = (state, updatedStudent) => {
    const updateInList = (list) => {
        const index = list.findIndex((student) => student._id === updatedStudent._id);
        if (index !== -1) {
            list[index] = updatedStudent;
        }
    };

    updateInList(state.students);
    updateInList(state.classStudents);
    if (state.currentStudent?._id === updatedStudent._id) {
        state.currentStudent = updatedStudent;
    }
};

// ─── Slice ───

const studentCoreSlice = createSlice({
    name: 'students',
    initialState: {
        students: [],
        currentStudent: null,
        classStudents: [],
        pagination: null,
        loading: false,
        error: null
    },
    reducers: {
        clearCurrentStudent: (state) => {
            state.currentStudent = null;
        },
        clearError: (state) => {
            state.error = null;
        }
    },
    extraReducers: (builder) => {
        builder
            // Fetch students
            .addCase(fetchStudents.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchStudents.fulfilled, (state, action) => {
                state.loading = false;
                state.students = action.payload.students;
                state.pagination = action.payload.pagination;
            })
            .addCase(fetchStudents.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            // Fetch single student
            .addCase(fetchStudent.pending, (state) => {
                state.loading = true;
            })
            .addCase(fetchStudent.fulfilled, (state, action) => {
                state.loading = false;
                state.currentStudent = action.payload.student;
            })
            .addCase(fetchStudent.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            // Fetch students by class
            .addCase(fetchStudentsByClass.fulfilled, (state, action) => {
                state.classStudents = action.payload.students;
            })
            // Create student
            .addCase(createStudent.fulfilled, (state, action) => {
                state.students.unshift(action.payload.student);
            })
            // Update student
            .addCase(updateStudent.fulfilled, (state, action) => {
                syncStudentAcrossCollections(state, action.payload.student);
            })
            .addCase(uploadStudentPhoto.fulfilled, (state, action) => {
                syncStudentAcrossCollections(state, action.payload.student);
            })
            .addCase(removeStudentPhoto.fulfilled, (state, action) => {
                syncStudentAcrossCollections(state, action.payload.student);
            })
            // Delete student
            .addCase(deleteStudent.fulfilled, (state, action) => {
                state.students = state.students.filter(s => s._id !== action.payload);
            })
            // Cross-slice: sync student data when promotion decisions are made
            .addCase(submitStudentPromotionDecision.fulfilled, (state, action) => {
                const updatedStudent = action.payload.student;
                if (updatedStudent) {
                    syncStudentAcrossCollections(state, updatedStudent);
                }
            })
            .addCase(updateStudentReEnrollment.fulfilled, (state, action) => {
                const updatedStudent = action.payload.student;
                if (updatedStudent) {
                    syncStudentAcrossCollections(state, updatedStudent);
                }
            });
    }
});

export const { clearCurrentStudent, clearError } = studentCoreSlice.actions;

// Selectors
export const selectStudents = (state) => state.students.students;
export const selectCurrentStudent = (state) => state.students.currentStudent;
export const selectClassStudents = (state) => state.students.classStudents;
export const selectStudentsLoading = (state) => state.students.loading;

export default studentCoreSlice.reducer;
