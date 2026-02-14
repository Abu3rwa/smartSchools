import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../config/api';

export const fetchDepartments = createAsyncThunk(
    'departments/fetchDepartments',
    async (params = {}, { rejectWithValue }) => {
        try {
            const response = await api.get('/departments', { params });
            return response.data.data.departments;
        } catch (error) {
            return rejectWithValue(
                error.response?.data?.message || 'Failed to fetch departments'
            );
        }
    }
);

export const createDepartment = createAsyncThunk(
    'departments/createDepartment',
    async (departmentData, { rejectWithValue }) => {
        try {
            const response = await api.post('/departments', departmentData);
            return response.data.data.department;
        } catch (error) {
            return rejectWithValue(
                error.response?.data?.message || 'Failed to create department'
            );
        }
    }
);

export const updateDepartment = createAsyncThunk(
    'departments/updateDepartment',
    async ({ id, data }, { rejectWithValue }) => {
        try {
            const response = await api.put(`/departments/${id}`, data);
            return response.data.data.department;
        } catch (error) {
            return rejectWithValue(
                error.response?.data?.message || 'Failed to update department'
            );
        }
    }
);

export const deleteDepartment = createAsyncThunk(
    'departments/deleteDepartment',
    async (id, { rejectWithValue }) => {
        try {
            await api.delete(`/departments/${id}`);
            return id;
        } catch (error) {
            return rejectWithValue(
                error.response?.data?.message || 'Failed to delete department'
            );
        }
    }
);

const departmentSlice = createSlice({
    name: 'departments',
    initialState: {
        departments: [],
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
            .addCase(fetchDepartments.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchDepartments.fulfilled, (state, action) => {
                state.loading = false;
                state.departments = action.payload;
            })
            .addCase(fetchDepartments.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            .addCase(createDepartment.fulfilled, (state, action) => {
                state.departments.push(action.payload);
            })
            .addCase(updateDepartment.fulfilled, (state, action) => {
                const index = state.departments.findIndex(
                    (d) => d._id === action.payload._id
                );
                if (index !== -1) {
                    state.departments[index] = action.payload;
                }
            })
            .addCase(deleteDepartment.fulfilled, (state, action) => {
                state.departments = state.departments.filter(
                    (d) => d._id !== action.payload
                );
            });
    }
});

export const { clearError } = departmentSlice.actions;

export const selectDepartments = (state) => state.departments.departments;
export const selectDepartmentsLoading = (state) => state.departments.loading;
export const selectDepartmentsError = (state) => state.departments.error;

export default departmentSlice.reducer;
