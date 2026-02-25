const MESSAGE_EVENT_PREFIX = 'message.thread.';
const DEFAULT_RECONNECT_DELAY_MS = 5000;
const PING_INTERVAL_MS = 25000;
const HEALTH_TIMEOUT_MS = 70000;
const AUTH_MESSAGE_TYPE = 'auth';

const safeParseJson = (rawValue) => {
    if (typeof rawValue !== 'string') return null;
    try {
        const parsed = JSON.parse(rawValue);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
};

const normalizeRealtimeEvent = (payload) => {
    const eventName = (payload?.event || '').toString().trim();
    if (!eventName.startsWith(MESSAGE_EVENT_PREFIX)) return null;
    const data = payload?.data && typeof payload.data === 'object' ? payload.data : {};
    return {
        name: eventName,
        data
    };
};

export class MessagesRealtimeService {
    constructor({ onEvent, onConnectionChange, reconnectDelayMs = DEFAULT_RECONNECT_DELAY_MS } = {}) {
        this._onEvent = typeof onEvent === 'function' ? onEvent : () => {};
        this._onConnectionChange = typeof onConnectionChange === 'function' ? onConnectionChange : () => {};
        this._reconnectDelayMs = Number.isFinite(reconnectDelayMs) && reconnectDelayMs > 0
            ? reconnectDelayMs
            : DEFAULT_RECONNECT_DELAY_MS;

        this._socket = null;
        this._url = '';
        this._isConnecting = false;
        this._isConnected = false;
        this._manualDisconnect = false;
        this._reconnectTimer = null;
        this._pingTimer = null;
        this._lastInboundAt = 0;
    }

    get isConnected() {
        return this._isConnected;
    }

    connect(url) {
        if (typeof WebSocket === 'undefined') return;
        const normalizedUrl = (url || '').toString().trim();
        if (!normalizedUrl) return;

        if (this._socket && this._isConnected && this._url === normalizedUrl) {
            return;
        }

        this._manualDisconnect = false;
        this._url = normalizedUrl;
        this._clearReconnectTimer();

        if (this._socket) {
            this._socket.close();
        } else {
            this._openSocket();
        }
    }

    disconnect() {
        this._manualDisconnect = true;
        this._clearReconnectTimer();
        this._stopPing();
        this._lastInboundAt = 0;

        const socket = this._socket;
        this._socket = null;
        this._isConnecting = false;
        this._setConnectedState(false);
        if (socket) {
            socket.close();
        }
    }

    dispose() {
        this.disconnect();
        this._onEvent = () => {};
        this._onConnectionChange = () => {};
    }

    _openSocket() {
        if (this._isConnecting || !this._url) return;

        this._isConnecting = true;
        const socket = new WebSocket(this._url);
        this._socket = socket;

        socket.onopen = () => {
            this._isConnecting = false;
            this._setConnectedState(true);
            this._lastInboundAt = Date.now();
            const authToken = this._resolveAuthToken();
            if (!authToken) {
                socket.close(1008, 'Unauthorized');
                return;
            }
            socket.send(JSON.stringify({ type: AUTH_MESSAGE_TYPE, token: authToken }));
            this._startPing();
        };

        socket.onmessage = (event) => {
            this._lastInboundAt = Date.now();
            const parsedPayload = safeParseJson(event?.data);
            if (!parsedPayload) return;
            const realtimeEvent = normalizeRealtimeEvent(parsedPayload);
            if (!realtimeEvent) return;
            this._onEvent(realtimeEvent);
        };

        socket.onerror = () => {};

        socket.onclose = () => {
            this._handleSocketClose();
        };
    }

    _resolveAuthToken() {
        if (typeof localStorage === 'undefined') return '';
        return (localStorage.getItem('token') || '').trim();
    }

    _handleSocketClose() {
        this._stopPing();
        this._socket = null;
        this._isConnecting = false;
        this._setConnectedState(false);

        if (this._manualDisconnect) {
            return;
        }

        this._scheduleReconnect();
    }

    _setConnectedState(nextConnected) {
        if (this._isConnected === nextConnected) return;
        this._isConnected = nextConnected;
        this._onConnectionChange(nextConnected);
    }

    _scheduleReconnect() {
        if (this._reconnectTimer || !this._url) return;
        this._reconnectTimer = window.setTimeout(() => {
            this._reconnectTimer = null;
            this._openSocket();
        }, this._reconnectDelayMs);
    }

    _clearReconnectTimer() {
        if (!this._reconnectTimer) return;
        window.clearTimeout(this._reconnectTimer);
        this._reconnectTimer = null;
    }

    _startPing() {
        this._stopPing();
        this._pingTimer = window.setInterval(() => {
            if (!this._socket || this._socket.readyState !== WebSocket.OPEN) {
                return;
            }
            if (this._lastInboundAt && (Date.now() - this._lastInboundAt) > HEALTH_TIMEOUT_MS) {
                this._socket.close();
                return;
            }
            this._socket.send(JSON.stringify({ type: 'ping' }));
        }, PING_INTERVAL_MS);
    }

    _stopPing() {
        if (!this._pingTimer) return;
        window.clearInterval(this._pingTimer);
        this._pingTimer = null;
    }
}
