import api from '../config/api';

const roomService = {
    getRooms: async () => {
        const response = await api.get('/rooms');
        return response.data;
    },

    createRoom: async (payload) => {
        const response = await api.post('/rooms', payload);
        return response.data;
    },

    updateRoom: async (id, payload) => {
        const response = await api.put(`/rooms/${id}`, payload);
        return response.data;
    },

    deleteRoom: async (id) => {
        const response = await api.delete(`/rooms/${id}`);
        return response.data;
    }
};

export default roomService;
