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
  const [connection, setConnection] = useState("connecting");
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  const [answers, setAnswers] = useState(null);
  const [roster, setRoster] = useState([]);

  useEffect(() => {
    if (!sessionId) return undefined;
    let disposed = false;
    let reconnectTimer;
    let heartbeatTimer;
    let socket;
    const pendingRequests = pendingRef.current;
    const token = localStorage.getItem("token");

    const connect = () => {
      if (disposed) return;
      setConnection("connecting");
      socket = new WebSocket(socketUrl());
      socketRef.current = socket;
      socket.addEventListener("open", () => {
        if (!token) {
          setError("Your login session has expired. Sign in again.");
          socket.close();
          return;
        }
        socket.send(JSON.stringify({ type: "auth", token }));
      });
      socket.addEventListener("message", (event) => {
        let message;
        try {
          message = JSON.parse(event.data);
        } catch {
          setError("Received an invalid lesson update.");
          return;
        }
        if (message.type === "authenticated") {
          setConnection("connected");
          socket.send(JSON.stringify({ type: "join", sessionId }));
          socket.__reportedAway = false;
          if (role === "student" && document.visibilityState === "hidden") {
            window.setTimeout(() => emitPresence(true), 0);
          }
          heartbeatTimer = window.setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({
                type: "action",
                action: "presence:ping",
                requestId: `ping-${Date.now()}`,
              }));
            }
          }, 5000);
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
          setAnswers(message.data.answers || null);
          setError("");
        } else if (message.type === "answers:update") {
          setAnswers(message.data);
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
          socket.close(4004, "Live session deleted");
        }
      });
      socket.addEventListener("close", (event) => {
        window.clearInterval(heartbeatTimer);
        if (event.code === 1008 || event.code === 4004) {
          disposed = true;
          setConnection("closed");
          if (event.code === 1008) setError("Your access to this live lesson is no longer valid.");
        } else {
          setConnection(disposed ? "closed" : "reconnecting");
        }
        if (!disposed) reconnectTimer = window.setTimeout(connect, 2500);
      });
      socket.addEventListener("error", () => {
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

  return { state, answers, roster, connection, error, sendAction };
}
