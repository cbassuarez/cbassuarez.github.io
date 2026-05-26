// this person — the live repository feed. Subscribes to the worker's WebSocket
// and falls back to polling /state if the socket cannot be held open.

import type { ExtractedPerson } from "../../../workers/seb-feed/src/this-person/types";
import { apiBase, fetchState } from "./api";

export type WallStatus = "connecting" | "live" | "polling";

export interface WallStreamHandlers {
  onSnapshot: (persons: ExtractedPerson[]) => void;
  onPerson: (person: ExtractedPerson) => void;
  onUpdate: (person: ExtractedPerson) => void;
  onCleared: () => void;
  onStatus?: (status: WallStatus) => void;
}

const POLL_INTERVAL_MS = 5000;
const PING_INTERVAL_MS = 45000;
const MAX_BACKOFF_MS = 30000;

export function openWallStream(handlers: WallStreamHandlers): () => void {
  let closed = false;
  let ws: WebSocket | null = null;
  let backoff = 1000;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;

  function socketUrl(): string {
    const u = new URL(apiBase() + "/api/this-person/socket");
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    return u.toString();
  }

  function startPolling(): void {
    if (pollTimer || closed) return;
    handlers.onStatus?.("polling");
    const tick = async () => {
      const persons = await fetchState();
      if (!closed) handlers.onSnapshot(persons);
    };
    void tick();
    pollTimer = setInterval(tick, POLL_INTERVAL_MS);
  }

  function stopPolling(): void {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function stopPing(): void {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
  }

  function scheduleReconnect(): void {
    if (closed) return;
    setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
  }

  function connect(): void {
    if (closed) return;
    handlers.onStatus?.("connecting");
    let socket: WebSocket;
    try {
      socket = new WebSocket(socketUrl());
    } catch {
      startPolling();
      scheduleReconnect();
      return;
    }
    ws = socket;

    socket.addEventListener("open", () => {
      backoff = 1000;
      stopPolling();
      handlers.onStatus?.("live");
      pingTimer = setInterval(() => {
        try {
          socket.send("ping");
        } catch {
          // socket closing; the close handler reconnects
        }
      }, PING_INTERVAL_MS);
    });

    socket.addEventListener("message", (event) => {
      const data = typeof event.data === "string" ? event.data : "";
      let msg: any;
      try {
        msg = JSON.parse(data);
      } catch {
        return; // keepalive "pong" and other non-JSON frames are ignored
      }
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "snapshot" && Array.isArray(msg.persons)) {
        handlers.onSnapshot(msg.persons as ExtractedPerson[]);
      } else if (msg.type === "person" && msg.person) {
        handlers.onPerson(msg.person as ExtractedPerson);
      } else if (msg.type === "update" && msg.person) {
        handlers.onUpdate(msg.person as ExtractedPerson);
      } else if (msg.type === "cleared") {
        handlers.onCleared();
      }
    });

    socket.addEventListener("close", () => {
      stopPing();
      ws = null;
      if (!closed) {
        startPolling();
        scheduleReconnect();
      }
    });

    socket.addEventListener("error", () => {
      try {
        socket.close();
      } catch {
        // ignore
      }
    });
  }

  connect();

  return function close(): void {
    closed = true;
    stopPolling();
    stopPing();
    if (ws) {
      try {
        ws.close();
      } catch {
        // ignore
      }
    }
  };
}
