import { useCallback, useEffect, useState } from 'react';
import api from '../../../../config/api';
import googleClassroomService from '../../../../services/googleClassroomService';
import googleFormsService from '../../../../services/googleFormsService';
import assignmentService from '../../../../services/assignmentService';
import curriculumService from '../../../../services/curriculumService';
import {
    CONNECTION_STATE,
    fromSchoolService,
    fromTokenStatus
} from '../utils/googleConnectionPresentation';

const INITIAL_ROWS = {
    gmail: { state: CONNECTION_STATE.LOADING, email: '' },
    classroom: { state: CONNECTION_STATE.LOADING, email: '' },
    forms: { state: CONNECTION_STATE.LOADING, email: '' },
    driveCurriculum: { state: CONNECTION_STATE.LOADING, email: '' },
    driveAttachments: { state: CONNECTION_STATE.LOADING, email: '' }
};

const safeRead = async (read) => {
    try {
        return await read();
    } catch (error) {
        return { state: CONNECTION_STATE.ERROR, email: '' };
    }
};

/**
 * Reads the five Google connections the portal can hold for one user.
 * Each read fails independently: a dropped request must not read as
 * "not connected", because that would invite a pointless reconnect.
 */
const readConnections = async () => {
    const [gmail, classroom, forms, driveCurriculum, driveAttachments] = await Promise.all([
        safeRead(() => api.get('/auth/gmail/status').then((response) => fromTokenStatus(response.data))),
        safeRead(() => googleClassroomService.getStatus().then(fromSchoolService)),
        safeRead(() => googleFormsService.getStatus().then(fromSchoolService)),
        safeRead(() => curriculumService.getGoogleDriveStatus().then(fromTokenStatus)),
        safeRead(() => assignmentService.getDriveConnection().then(fromTokenStatus))
    ]);

    return { gmail, classroom, forms, driveCurriculum, driveAttachments };
};

const useGoogleConnections = ({ enabled = true } = {}) => {
    const [rows, setRows] = useState(INITIAL_ROWS);
    const [loading, setLoading] = useState(enabled);

    const refresh = useCallback(async () => {
        if (!enabled) return;
        setLoading(true);
        setRows(await readConnections());
        setLoading(false);
    }, [enabled]);

    useEffect(() => {
        if (!enabled) return undefined;
        let cancelled = false;
        readConnections().then((next) => {
            if (cancelled) return;
            setRows(next);
            setLoading(false);
        });
        const onDisconnected = () => refresh();
        window.addEventListener('google-suite-disconnected', onDisconnected);
        return () => {
            cancelled = true;
            window.removeEventListener('google-suite-disconnected', onDisconnected);
        };
    }, [enabled, refresh]);

    return { rows, loading, refresh };
};

export default useGoogleConnections;
