import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../config/api';

// Async thunks
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
            console.error('Student creation error:', error);
            console.error('Error response:', error.response?.data);
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

export const createStudentLogin = createAsyncThunk(
    'students/createStudentLogin',
    async ({ studentId, email }, { rejectWithValue }) => {
        try {
            const response = await api.post(`/students/${studentId}/create-login`, { email });
            return response.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to create student login');
        }
    }
);

export const resetStudentPassword = createAsyncThunk(
    'students/resetStudentPassword',
    async (studentId, { rejectWithValue }) => {
        try {
            const response = await api.post(`/students/${studentId}/reset-password`);
            return response.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to reset password');
        }
    }
);

export const bulkCreateStudentLogin = createAsyncThunk(
    'students/bulkCreateStudentLogin',
    async (studentIds, { rejectWithValue }) => {
        try {
            const response = await api.post('/students/bulk-create-login', { studentIds });
            return response.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to create logins');
        }
    }
);

const studentSlice = createSlice({
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
                const index = state.students.findIndex(s => s._id === action.payload.student._id);
                if (index !== -1) {
                    state.students[index] = action.payload.student;
                }
                if (state.currentStudent?._id === action.payload.student._id) {
                    state.currentStudent = action.payload.student;
                }
            })
            // Delete student
            .addCase(deleteStudent.fulfilled, (state, action) => {
                state.students = state.students.filter(s => s._id !== action.payload);
            });
    }
});

export const { clearCurrentStudent, clearError } = studentSlice.actions;

// Selectors
export const selectStudents = (state) => state.students.students;
export const selectCurrentStudent = (state) => state.students.currentStudent;
export const selectClassStudents = (state) => state.students.classStudents;
export const selectStudentsLoading = (state) => state.students.loading;

export default studentSlice.reducer;
