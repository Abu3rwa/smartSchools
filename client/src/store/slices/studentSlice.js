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

export const sendStudentLoginInvite = createAsyncThunk(
    'students/sendStudentLoginInvite',
    async ({ studentId, email }, { rejectWithValue }) => {
        try {
            const response = await api.post(`/students/${studentId}/send-login-invite`, { email });
            return response.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to send student invite');
        }
    }
);

export const bulkSendStudentLoginInvites = createAsyncThunk(
    'students/bulkSendStudentLoginInvites',
    async (studentIds, { rejectWithValue }) => {
        try {
            const response = await api.post('/students/bulk-send-login-invites', { studentIds });
            return response.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to send student invites');
        }
    }
);

export const sendParentCredentials = createAsyncThunk(
    'students/sendParentCredentials',
    async (studentId, { rejectWithValue }) => {
        try {
            const response = await api.post(`/students/${studentId}/send-parent-credentials`);
            return response.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to send parent credentials');
        }
    }
);

export const sendParentLoginInvite = createAsyncThunk(
    'students/sendParentLoginInvite',
    async (studentId, { rejectWithValue }) => {
        try {
            const response = await api.post(`/students/${studentId}/send-parent-login-invite`);
            return response.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to send parent invite');
        }
    }
);

export const bulkSendParentLoginInvites = createAsyncThunk(
    'students/bulkSendParentLoginInvites',
    async (studentIds, { rejectWithValue }) => {
        try {
            const response = await api.post('/students/bulk-send-parent-login-invites', { studentIds });
            return response.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to send parent invites');
        }
    }
);

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

export const fetchPromotionQueue = createAsyncThunk(
    'students/fetchPromotionQueue',
    async (params = {}, { rejectWithValue }) => {
        try {
            const response = await api.get('/students/promotion/queue', { params });
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to fetch promotion queue');
        }
    }
);

export const submitStudentPromotionDecision = createAsyncThunk(
    'students/submitPromotionDecision',
    async ({ studentId, decisionData }, { rejectWithValue }) => {
        try {
            const response = await api.post(`/students/${studentId}/promotion-decisions`, decisionData);
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to submit promotion decision');
        }
    }
);

export const updateStudentReEnrollment = createAsyncThunk(
    'students/updateStudentReEnrollment',
    async ({ studentId, updates }, { rejectWithValue }) => {
        try {
            const response = await api.patch(`/students/${studentId}/re-enrollment`, updates);
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to update re-enrollment status');
        }
    }
);

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

const syncStudentInPromotionQueue = (state, updatedStudent, latestDecision = undefined) => {
    state.promotionQueue = state.promotionQueue.map((item) => {
        if (item?.student?._id !== updatedStudent._id) {
            return item;
        }

        let decisionStatus = item.decisionStatus;
        if (latestDecision) {
            if (latestDecision.decisionType === 'hold_review' && latestDecision.approvalStatus === 'approved') {
                decisionStatus = 'hold_review';
            } else {
                decisionStatus = latestDecision.approvalStatus;
            }
        }

        return {
            ...item,
            student: updatedStudent,
            latestDecision: latestDecision === undefined ? item.latestDecision : latestDecision,
            decisionStatus
        };
    });
};

const studentSlice = createSlice({
    name: 'students',
    initialState: {
        students: [],
        currentStudent: null,
        classStudents: [],
        promotionQueue: [],
        promotionQueuePagination: null,
        promotionQueueAcademicYear: null,
        pagination: null,
        loading: false,
        promotionQueueLoading: false,
        promotionActionLoading: false,
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
            // Promotion queue
            .addCase(fetchPromotionQueue.pending, (state) => {
                state.promotionQueueLoading = true;
                state.error = null;
            })
            .addCase(fetchPromotionQueue.fulfilled, (state, action) => {
                state.promotionQueueLoading = false;
                state.promotionQueue = action.payload.queue || [];
                state.promotionQueuePagination = action.payload.pagination || null;
                state.promotionQueueAcademicYear = action.payload.academicYear || null;
            })
            .addCase(fetchPromotionQueue.rejected, (state, action) => {
                state.promotionQueueLoading = false;
                state.error = action.payload;
            })
            .addCase(submitStudentPromotionDecision.pending, (state) => {
                state.promotionActionLoading = true;
                state.error = null;
            })
            .addCase(submitStudentPromotionDecision.fulfilled, (state, action) => {
                state.promotionActionLoading = false;
                const updatedStudent = action.payload.student;
                if (updatedStudent) {
                    syncStudentAcrossCollections(state, updatedStudent);
                    syncStudentInPromotionQueue(state, updatedStudent, action.payload.decision || null);
                }
            })
            .addCase(submitStudentPromotionDecision.rejected, (state, action) => {
                state.promotionActionLoading = false;
                state.error = action.payload;
            })
            .addCase(updateStudentReEnrollment.pending, (state) => {
                state.promotionActionLoading = true;
                state.error = null;
            })
            .addCase(updateStudentReEnrollment.fulfilled, (state, action) => {
                state.promotionActionLoading = false;
                const updatedStudent = action.payload.student;
                if (updatedStudent) {
                    syncStudentAcrossCollections(state, updatedStudent);
                    syncStudentInPromotionQueue(state, updatedStudent);
                }
            })
            .addCase(updateStudentReEnrollment.rejected, (state, action) => {
                state.promotionActionLoading = false;
                state.error = action.payload;
            });
    }
});

export const { clearCurrentStudent, clearError } = studentSlice.actions;

// Selectors
export const selectStudents = (state) => state.students.students;
export const selectCurrentStudent = (state) => state.students.currentStudent;
export const selectClassStudents = (state) => state.students.classStudents;
export const selectStudentsLoading = (state) => state.students.loading;
export const selectPromotionQueue = (state) => state.students.promotionQueue;
export const selectPromotionQueuePagination = (state) => state.students.promotionQueuePagination;
export const selectPromotionQueueAcademicYear = (state) => state.students.promotionQueueAcademicYear;
export const selectPromotionQueueLoading = (state) => state.students.promotionQueueLoading;
export const selectPromotionActionLoading = (state) => state.students.promotionActionLoading;

export default studentSlice.reducer;
