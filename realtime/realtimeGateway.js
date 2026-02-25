import jwt from 'jsonwebtoken';
import { WebSocketServer } from 'ws';

import User from '../models/User.js';
import logger from '../utils/logger.js';

const OPEN_STATE = 1;
const AUTH_TIMEOUT_MS = 10000;

let gateway = null;
const userSockets = new Map();

const toId = (value) => (value == null ? '' : String(value));

const safeSend = (socket, payload) => {
  if (!socket || socket.readyState !== OPEN_STATE) return;
  try {
    socket.send(JSON.stringify(payload));
  } catch (error) {
    logger.warn('realtime_socket_send_failed', { error: error?.message || String(error) });
  }
};

const addSocketForUser = (userId, socket) => {
  const key = toId(userId);
  if (!key) return;
  if (!userSockets.has(key)) {
    userSockets.set(key, new Set());
  }
  userSockets.get(key).add(socket);
};

const removeSocketForUser = (userId, socket) => {
  const key = toId(userId);
  if (!key) return;
  const sockets = userSockets.get(key);
  if (!sockets) return;
  sockets.delete(socket);
  if (sockets.size === 0) {
    userSockets.delete(key);
  }
};

const getConnectionTokenFromHeaders = (request) => {
  const authHeader = String(request.headers.authorization || '').trim();
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  return '';
};

const authenticateToken = async (token) => {
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id)
      .select('_id role school isActive firstName lastName email')
      .setOptions({ skipTenantFilter: true });

    if (!user || user.isActive === false) {
      return null;
    }

    return user;
  } catch {
    return null;
  }
};

const authenticateSocketFromRequest = async (request) => {
  const token = getConnectionTokenFromHeaders(request);
  if (!token) return null;
  return authenticateToken(token);
};

export const initRealtimeGateway = (httpServer) => {
  if (gateway) return gateway;

  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  gateway = wss;

  wss.on('connection', async (socket, request) => {
    let userId = '';
    let isAuthenticated = false;
    let isAuthenticating = false;
    let authTimeout = setTimeout(() => {
      if (isAuthenticated) return;
      safeSend(socket, {
        event: 'system.error',
        data: { message: 'Authentication timeout' }
      });
      socket.close(1008, 'Unauthorized');
    }, AUTH_TIMEOUT_MS);

    const clearAuthTimeout = () => {
      if (!authTimeout) return;
      clearTimeout(authTimeout);
      authTimeout = null;
    };

    const finalizeAuth = (user) => {
      if (!user || isAuthenticated) return;
      isAuthenticated = true;
      userId = toId(user._id);
      socket.__userId = userId;
      socket.__schoolId = toId(user.school);
      socket.__role = user.role;
      addSocketForUser(userId, socket);
      clearAuthTimeout();

      safeSend(socket, {
        event: 'system.connected',
        data: {
          userId,
          role: user.role,
          connectedAt: new Date().toISOString()
        }
      });
    };

    const rejectUnauthorized = () => {
      clearAuthTimeout();
      safeSend(socket, {
        event: 'system.error',
        data: { message: 'Unauthorized websocket connection' }
      });
      socket.close(1008, 'Unauthorized');
    };

    const userFromHeaders = await authenticateSocketFromRequest(request);
    if (userFromHeaders) {
      finalizeAuth(userFromHeaders);
    }

    socket.on('message', (raw) => {
      const handleMessage = async () => {
        let parsed;
        try {
          parsed = JSON.parse(String(raw));
        } catch {
          safeSend(socket, {
            event: 'system.error',
            data: { message: 'Invalid websocket payload' }
          });
          return;
        }

        if (!isAuthenticated) {
          if (parsed?.type !== 'auth') {
            safeSend(socket, {
              event: 'system.error',
              data: { message: 'Authentication required' }
            });
            return;
          }

          if (isAuthenticating) return;
          isAuthenticating = true;
          const token = String(parsed?.token || '').trim();
          const user = await authenticateToken(token);
          isAuthenticating = false;
          if (!user) {
            rejectUnauthorized();
            return;
          }
          finalizeAuth(user);
          return;
        }

        if (parsed?.type === 'ping') {
          safeSend(socket, {
            event: 'system.pong',
            data: { at: new Date().toISOString() }
          });
        }
      };

      void handleMessage().catch(() => {
        safeSend(socket, {
          event: 'system.error',
          data: { message: 'Unexpected websocket error' }
        });
      });
    });

    socket.on('close', () => {
      clearAuthTimeout();
      removeSocketForUser(userId, socket);
    });

    socket.on('error', () => {
      clearAuthTimeout();
      removeSocketForUser(userId, socket);
    });
  });

  logger.info('realtime_gateway_started', { path: '/ws' });
  return wss;
};

export const emitRealtimeEventToUsers = ({ userIds = [], event, data = {} }) => {
  const uniqueUserIds = [...new Set((userIds || []).map((id) => toId(id)).filter(Boolean))];
  if (uniqueUserIds.length === 0 || !event) {
    return { targetedUsers: 0, deliveredSockets: 0 };
  }

  const payload = {
    event,
    data: {
      ...data,
      emittedAt: new Date().toISOString()
    }
  };

  let deliveredSockets = 0;
  for (const userId of uniqueUserIds) {
    const sockets = userSockets.get(userId);
    if (!sockets || sockets.size === 0) continue;
    for (const socket of sockets) {
      if (socket.readyState !== OPEN_STATE) continue;
      deliveredSockets += 1;
      safeSend(socket, payload);
    }
  }

  return {
    targetedUsers: uniqueUserIds.length,
    deliveredSockets
  };
};

export const closeRealtimeGateway = async () => {
  if (!gateway) return;
  await new Promise((resolve) => gateway.close(resolve));
  gateway = null;
  userSockets.clear();
};

