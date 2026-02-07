import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import classReducer from './slices/classSlice';
import studentReducer from './slices/studentSlice';
import gradeReducer from './slices/gradeSlice';
import subjectReducer from './slices/subjectSlice';
import teacherReducer from './slices/teacherSlice';
import notificationReducer from './slices/notificationSlice';
import uiReducer from './slices/uiSlice';
import lessonReducer from './slices/lessonSlice';
import dashboardReducer from './slices/dashboardSlice';
import schoolReducer from './slices/schoolSlice';
import subscriptionReducer from './slices/subscriptionSlice';
import behaviorReducer from './slices/behaviorSlice';

export const store = configureStore({
    reducer: {
        auth: authReducer,
        classes: classReducer,
        students: studentReducer,
        grades: gradeReducer,
        subjects: subjectReducer,
        teachers: teacherReducer,
        notifications: notificationReducer,
        ui: uiReducer,
        lessons: lessonReducer,
        dashboard: dashboardReducer,
        schools: schoolReducer,
        subscriptions: subscriptionReducer,
        behavior: behaviorReducer
    },
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
            serializableCheck: {
                ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE']
            }
        })
});

export default store;
