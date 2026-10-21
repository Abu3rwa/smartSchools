import { useCallback, useEffect, useRef, useState } from "react";
import api from "../config/api";

const socketUrl = () => {
  const base = new URL(api.defaults.baseURL || "/api", window.location.href);
  base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  base.pathname = `${base.pathname.replace(/\/api\/?$/, "").replace(/\/$/, "")}/ws/live-lessons`;
  base.search = "";
  return base.toString();
};

export default function useLiveLessonSocket(sessionId, role) {
  const socketRef = useRef(null);
  const pendingRef = useRef(new Map());
  const lastCursorMoveAtRef = useRef(0);
  const [connection, setConnection] = useState("connecting");
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  const [roster, setRoster] = useState([]);
  const [sessionJoined, setSessionJoined] = useState(false);
  const [cursorSpotlight, setCursorSpotlight] = useState({
    enabled: false,
    visible: false,
    x: null,
    y: null,
  });

  useEffect(() => {
    if (!sessionId) return undefined;
    let disposed = false;
    let reconnectTimer;
    let heartbeatTimer;
    let socket;
    const pendingRequests = pendingRef.current;

    const connect = () => {
      if (disposed) return;
      setSessionJoined(false);
      const token = localStorage.getItem("token");
      const currentSocket = new WebSocket(socketUrl());
      setConnection("connecting");
      socket = currentSocket;
      socketRef.current = currentSocket;
      currentSocket.addEventListener("open", () => {
        if (!token) {
          disposed = true;
          setConnection("closed");
          setError("Your login session has expired. Sign in again.");
          currentSocket.close();
          return;
        }
        currentSocket.send(JSON.stringify({ type: "auth", token }));
      });
      currentSocket.addEventListener("message", (event) => {
        let message;
        try {
          message = JSON.parse(event.data);
        } catch {
          setError("Received an invalid lesson update.");
          return;
        }
        if (message.type === "authenticated") {
          setConnection("connected");
          currentSocket.send(JSON.stringify({ type: "join", sessionId }));
          currentSocket.__reportedAway = false;
          if (role === "student" && document.visibilityState === "hidden") {
            window.setTimeout(() => emitPresence(true), 0);
          }
          heartbeatTimer = window.setInterval(() => {
            if (currentSocket.readyState === WebSocket.OPEN) {
              currentSocket.send(JSON.stringify({
                type: "action",
                action: "presence:ping",
                requestId: `ping-${Date.now()}`,
              }));
            }
          }, 5000);
        } else if (message.type === "joined") {
          currentSocket.__joinedSession = true;
          setSessionJoined(true);
        } else if (message.type === "cursor:spotlight") {
          setCursorSpotlight(message.data);
        } else if (message.type === "ack") {
          const pending = pendingRef.current.get(message.requestId);
          if (pending) {
            pendingRef.current.delete(message.requestId);
            window.clearTimeout(pending.timeout);
            if (message.ok) pending.resolve(message.data || {});
            else {
              const text = message.error?.message || "Lesson action failed.";
              setError(text);
              pending.reject(new Error(text));
            }
          }
        } else if (message.type === "session:state" || message.type === "teacher:state") {
          setState(message.data);
          setRoster(message.data.roster || []);
          setError("");
        } else if (message.type === "roster:update") {
          setRoster(message.data?.roster || []);
        } else if (message.type === "results:revealed") {
          setState((previous) => previous ? {
            ...previous,
            revealed: true,
            myIsCorrect: message.data.myIsCorrect,
            questionOpen: false,
          } : previous);
        } else if (message.type === "session:ended") {
          setState((previous) => previous ? { ...previous, status: "ended" } : previous);
        } else if (message.type === "session:deleted") {
          disposed = true;
          setConnection("closed");
          setError("This live session was deleted by the teacher.");
          currentSocket.close(4004, "Live session deleted");
        }
      });
      currentSocket.addEventListener("close", (event) => {
        window.clearInterval(heartbeatTimer);
        currentSocket.__joinedSession = false;
        setSessionJoined(false);
        setCursorSpotlight({
          enabled: false,
          visible: false,
          x: null,
          y: null,
        });
        if (
          event.code === 1008 &&
          ["Unauthorized", "Authentication timeout"].includes(event.reason)
        ) {
          setConnection("reconnecting");
          setError("Refreshing your login before reconnecting to the lesson…");
          void (async () => {
            try {
              let latestToken = localStorage.getItem("token");
              if (!latestToken) throw new Error("Your login session has expired.");
              if (latestToken === token) {
                await api.get("/auth/me");
                latestToken = localStorage.getItem("token");
              }
              if (!latestToken) {
                throw new Error("Your login session has expired. Sign in again.");
              }
              if (latestToken === token && event.reason === "Unauthorized") {
                throw new Error("Your login session could not be refreshed. Sign in again.");
              }
              if (disposed) return;
              reconnectTimer = window.setTimeout(
                connect,
                event.reason === "Authentication timeout" ? 2500 : 250,
              );
            } catch (refreshError) {
              if (disposed) return;
              if (
                event.reason === "Authentication timeout" &&
                (!refreshError.response || refreshError.response.status >= 500)
              ) {
                setConnection("reconnecting");
                setError("The server is temporarily unavailable. Retrying the lesson connection…");
                reconnectTimer = window.setTimeout(connect, 2500);
                return;
              }
              disposed = true;
              setConnection("closed");
              setError(refreshError.message || "Could not refresh your login. Sign in again.");
            }
          })();
          return;
        }
        if (event.code === 1008 || event.code === 4004) {
          disposed = true;
          setConnection("closed");
          if (event.code === 1008) setError("Your access to this live lesson is no longer valid.");
        } else {
          setConnection(disposed ? "closed" : "reconnecting");
        }
        if (!disposed) reconnectTimer = window.setTimeout(connect, 2500);
      });
      currentSocket.addEventListener("error", () => {
        setError("The live lesson connection was interrupted. Reconnecting…");
      });
    };
    connect();

    const emitPresence = (away) => {
      if (role !== "student" || socketRef.current?.readyState !== WebSocket.OPEN) return;
      if (socketRef.current.__reportedAway === away) return;
      socketRef.current.__reportedAway = away;
      const requestId = `presence-${Date.now()}`;
      socketRef.current.send(JSON.stringify({
        type: "action",
        action: away ? "presence:away" : "presence:back",
        data: { reason: away ? "visibility_hidden" : "visibility_visible" },
        requestId,
      }));
    };
    const onVisibility = () => emitPresence(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      disposed = true;
      window.clearTimeout(reconnectTimer);
      window.clearInterval(heartbeatTimer);
      setSessionJoined(false);
      setCursorSpotlight({
        enabled: false,
        visible: false,
        x: null,
        y: null,
      });
      document.removeEventListener("visibilitychange", onVisibility);
      socket?.close();
      for (const pending of pendingRequests.values()) {
        window.clearTimeout(pending.timeout);
        pending.reject(new Error("Lesson connection closed."));
      }
      pendingRequests.clear();
    };
  }, [sessionId, role]);

  const sendAction = useCallback((action, data = {}) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("Waiting for the lesson connection."));
    }
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        pendingRef.current.delete(requestId);
        reject(new Error("The lesson action timed out. Please try again."));
      }, 8000);
      pendingRef.current.set(requestId, { resolve, reject, timeout });
      socket.send(JSON.stringify({ type: "action", action, data, requestId }));
    });
  }, []);

  const sendCursor = useCallback((action, data = {}) => {
    const socket = socketRef.current;
    if (
      role !== "teacher" ||
      !socket?.__joinedSession ||
      socket.readyState !== WebSocket.OPEN
    ) {
      return false;
    }
    if (action === "move") {
      const now = Date.now();
      if (now - lastCursorMoveAtRef.current < 33) return false;
      lastCursorMoveAtRef.current = now;
    }
    socket.send(JSON.stringify({ type: "cursor", action, data }));
    if (action === "toggle" && typeof data.enabled === "boolean") {
      setCursorSpotlight({
        enabled: data.enabled,
        visible: false,
        x: null,
        y: null,
      });
    } else if (action === "move") {
      setCursorSpotlight((current) =>
        current.enabled
          ? { ...current, visible: true, x: data.x, y: data.y }
          : current,
      );
    } else if (action === "hide") {
      setCursorSpotlight((current) =>
        current.enabled
          ? { ...current, visible: false, x: null, y: null }
          : current,
      );
    }
    return true;
  }, [role]);

  return {
    state,
    roster,
    connection,
    error,
    sendAction,
    sendCursor,
    cursorSpotlight,
    sessionJoined,
  };
}
