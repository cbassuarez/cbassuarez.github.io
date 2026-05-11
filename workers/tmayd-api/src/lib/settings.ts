import type { Env, PublicStatus } from "../types";
import { nowIso } from "./json";

export async function getSetting(
  env: Env,
  key: string,
  fallback = ""
): Promise<string> {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = ?1")
    .bind(key)
    .first<{ value: string }>();
  return row?.value ?? fallback;
}

export async function setSetting(env: Env, key: string, value: string): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3) " +
      "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
  )
    .bind(key, value, nowIso())
    .run();
}

export interface ResolvedStatus {
  bridge: BridgeStatus | null;
  heartbeatFresh: boolean;
  forceClosed: boolean;
  maintenance: boolean;
  allowQueueWhenOffline: boolean;
  maintenanceMessage: string;
}

export interface BridgeStatus {
  bridge_id: string;
  status: string;
  printer_online: number;
  camera_online: number;
  local_queue_depth: number;
  last_printed_public_code: string | null;
  last_error: string | null;
  last_seen_at: string;
}

export async function loadBridge(env: Env): Promise<BridgeStatus | null> {
  return (
    (await env.DB.prepare("SELECT * FROM bridge_heartbeats ORDER BY last_seen_at DESC LIMIT 1")
      .first<BridgeStatus>()) ?? null
  );
}

export async function resolveStatus(env: Env): Promise<ResolvedStatus> {
  const [forceClosed, maintenance, allowQueueWhenOffline, maintenanceMessage] =
    await Promise.all([
      getSetting(env, "FORCE_INTAKE_CLOSED", "true"),
      getSetting(env, "MAINTENANCE_MODE", "false"),
      getSetting(env, "ALLOW_QUEUE_WHEN_BRIDGE_OFFLINE", "false"),
      getSetting(env, "MAINTENANCE_MESSAGE", "")
    ]);

  const bridge = await loadBridge(env);
  const staleSeconds = parseInt(env.TMAYD_HEARTBEAT_STALE_SECONDS, 10) || 90;
  const heartbeatFresh = bridge
    ? Date.now() - Date.parse(bridge.last_seen_at) < staleSeconds * 1000
    : false;

  return {
    bridge,
    heartbeatFresh,
    forceClosed: forceClosed === "true",
    maintenance: maintenance === "true",
    allowQueueWhenOffline: allowQueueWhenOffline === "true",
    maintenanceMessage
  };
}

export function statusFromResolved(resolved: ResolvedStatus): PublicStatus {
  const { bridge, heartbeatFresh, forceClosed, maintenance, allowQueueWhenOffline,
    maintenanceMessage } = resolved;

  if (maintenance) {
    return {
      status: "maintenance",
      intakeOpen: false,
      printingOpen: false,
      archiveOpen: true,
      lastHeartbeatAt: bridge?.last_seen_at ?? "",
      message: maintenanceMessage || "The machine is in maintenance."
    };
  }

  if (forceClosed) {
    return {
      status: "inactive",
      intakeOpen: false,
      printingOpen: false,
      archiveOpen: true,
      lastHeartbeatAt: bridge?.last_seen_at ?? "",
      message: maintenanceMessage || "The machine is not currently accepting messages."
    };
  }

  if (!bridge || !heartbeatFresh) {
    return {
      status: "offline",
      intakeOpen: allowQueueWhenOffline,
      printingOpen: false,
      archiveOpen: true,
      lastHeartbeatAt: bridge?.last_seen_at ?? "",
      message: allowQueueWhenOffline
        ? "Machine offline; messages will print when it returns."
        : "The machine is offline. Please try again later."
    };
  }

  const printerOnline = !!bridge.printer_online;
  if (!printerOnline) {
    return {
      status: "offline",
      intakeOpen: allowQueueWhenOffline,
      printingOpen: false,
      archiveOpen: true,
      lastHeartbeatAt: bridge.last_seen_at,
      message: "Printer is offline."
    };
  }

  return {
    status: bridge.status === "printing" ? "printing" : "idle",
    intakeOpen: true,
    printingOpen: true,
    archiveOpen: true,
    lastHeartbeatAt: bridge.last_seen_at,
    message: ""
  };
}
