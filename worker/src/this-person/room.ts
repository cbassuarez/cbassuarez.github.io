// this person — the repository Durable Object.
// One instance (fixed name) owns the append-only ledger of ExtractedPerson
// records in SQLite and broadcasts changes to every open wall over WebSocket.
//
// The repository contains only successful public entries. Failed, canceled,
// refused, unsupported, and empty attempts never reach this class. It stores
// only the ExtractedPerson model — no IP, user agent, referrer, OAuth token,
// session, or raw Google archive text.

import type { ExtractedPerson } from "./types";
import { zeroPad } from "./types";

interface PersonRow {
  append_order: number;
  person_json: string;
}

interface GamCacheRow {
  kind: string;
  external_id: string;
  display_name: string;
}

interface RoomEnv {
  THIS_PERSON_SHOW_TIME?: string;
}

export type GamCacheKind = "advertiser" | "lineItem" | "order" | "creative";

export interface GamCacheEntry {
  kind: GamCacheKind;
  id: string;
  name: string;
}

export class ThisPersonRoom {
  private readonly state: DurableObjectState;
  private readonly env: RoomEnv;

  constructor(state: DurableObjectState, env: RoomEnv) {
    this.state = state;
    this.env = env;
    this.state.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong")
    );
    void this.state.blockConcurrencyWhile(async () => {
      this.state.storage.sql.exec(
        `CREATE TABLE IF NOT EXISTS persons (
           append_order INTEGER PRIMARY KEY AUTOINCREMENT,
           person_json TEXT NOT NULL
         )`
      );
      this.state.storage.sql.exec(
        `CREATE TABLE IF NOT EXISTS gam_cache (
           kind TEXT NOT NULL,
           external_id TEXT NOT NULL,
           display_name TEXT NOT NULL,
           cached_at INTEGER NOT NULL,
           PRIMARY KEY (kind, external_id)
         )`
      );
    });
  }

  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path.endsWith("/socket")) return this.handleSocket(request);
    if (path.endsWith("/state")) return this.json({ persons: this.readAll() });
    if (path.endsWith("/append")) return this.handleAppend(request);
    if (path.endsWith("/enroll")) return this.handleEnroll(request);
    if (path.endsWith("/clear")) return this.handleClear();
    if (path.endsWith("/gam-cache-read")) return this.handleGamCacheRead(request);
    if (path.endsWith("/gam-cache-write")) return this.handleGamCacheWrite(request);
    if (path.endsWith("/gam-cache-list")) return this.handleGamCacheList();
    if (path.endsWith("/export")) {
      return this.json({ persons: this.readAll(), exportedAt: new Date().toISOString() });
    }
    return this.json({ error: "not_found" }, 404);
  }

  private handleSocket(request: Request): Response {
    if ((request.headers.get("upgrade") || "").toLowerCase() !== "websocket") {
      return new Response("expected websocket upgrade", { status: 426 });
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.state.acceptWebSocket(server);
    try {
      server.send(JSON.stringify({ type: "snapshot", persons: this.readAll() }));
    } catch {
      // socket may have closed before the snapshot could be sent
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  // The worker builds the ExtractedPerson; the DO assigns its public number and
  // append order, then persists and broadcasts it.
  private async handleAppend(request: Request): Promise<Response> {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return this.json({ error: "bad_body" }, 400);
    }
    const person = body?.person as ExtractedPerson | undefined;
    if (!person || typeof person !== "object" || !Array.isArray(person.claims)) {
      return this.json({ error: "bad_person" }, 400);
    }

    this.state.storage.sql.exec(`INSERT INTO persons (person_json) VALUES (?)`, "");
    const order = Number(
      this.state.storage.sql
        .exec<{ id: number }>(`SELECT last_insert_rowid() AS id`)
        .toArray()[0]?.id || 0
    );

    person.appendedAtOrder = order;
    person.publicNumber = order;
    person.id = zeroPad(order);
    if (this.env.THIS_PERSON_SHOW_TIME === "true") {
      person.appendedAtVisible = new Date(
        Math.floor(Date.now() / 3600000) * 3600000
      ).toISOString();
    } else {
      person.appendedAtVisible = null;
    }

    this.state.storage.sql.exec(
      `UPDATE persons SET person_json = ? WHERE append_order = ?`,
      JSON.stringify(person),
      order
    );
    this.broadcast(JSON.stringify({ type: "person", person }));
    return this.json({ person });
  }

  // Marks an already-appended person as enrolled in the return loop.
  private async handleEnroll(request: Request): Promise<Response> {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return this.json({ error: "bad_body" }, 400);
    }
    const order = Number(body?.id);
    if (!Number.isInteger(order) || order <= 0) {
      return this.json({ error: "bad_id" }, 400);
    }
    const rows = this.state.storage.sql
      .exec<PersonRow>(`SELECT append_order, person_json FROM persons WHERE append_order = ?`, order)
      .toArray();
    if (rows.length === 0) return this.json({ error: "not_found" }, 404);

    let person: ExtractedPerson;
    try {
      person = JSON.parse(rows[0].person_json);
    } catch {
      return this.json({ error: "corrupt" }, 500);
    }

    person.status = "extracted_and_enrolled";
    person.returnLoop = {
      enrolled: true,
      events: ["THIS_PERSON_RETURN_LOOP"],
      returned: person.returnLoop?.returned ?? false,
    };
    if (!person.claims.some((c) => c.sentence === "this person entered the return loop")) {
      person.claims.push({
        sentence: "this person entered the return loop",
        sourceNote: "returned through ad loop",
        fragments: [],
        intensity: "institutional",
      });
      person.generatedText +=
        "\n\nthis person entered the return loop\nsource: returned through ad loop";
    }

    this.state.storage.sql.exec(
      `UPDATE persons SET person_json = ? WHERE append_order = ?`,
      JSON.stringify(person),
      order
    );
    this.broadcast(JSON.stringify({ type: "update", person }));
    return this.json({ person });
  }

  private handleClear(): Response {
    this.state.storage.sql.exec(`DELETE FROM persons`);
    try {
      this.state.storage.sql.exec(`DELETE FROM sqlite_sequence WHERE name = 'persons'`);
    } catch {
      // sqlite_sequence only exists once an AUTOINCREMENT row has been written
    }
    this.broadcast(JSON.stringify({ type: "cleared" }));
    return this.json({ ok: true });
  }

  // ── GAM name cache ────────────────────────────────────────────────────────
  // Looks up which (kind, id) pairs we already have display names for. The
  // worker resolves only the misses against the GAM REST API, then writes them
  // back here. Keys never expire — advertiser names are durable, and a stale
  // entry is much better than a Google quota hit per visitor.

  private async handleGamCacheRead(request: Request): Promise<Response> {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return this.json({ error: "bad_body" }, 400);
    }
    const requested = Array.isArray(body?.keys) ? body.keys : [];
    if (requested.length === 0) return this.json({ entries: [] });
    const entries: GamCacheEntry[] = [];
    for (const raw of requested) {
      const kind = raw?.kind as GamCacheKind;
      const id = String(raw?.id || "").trim();
      if (!kind || !id) continue;
      const rows = this.state.storage.sql
        .exec<GamCacheRow>(
          `SELECT kind, external_id, display_name FROM gam_cache WHERE kind = ? AND external_id = ?`,
          kind,
          id
        )
        .toArray();
      if (rows.length > 0 && rows[0].display_name) {
        entries.push({ kind, id, name: rows[0].display_name });
      }
    }
    return this.json({ entries });
  }

  private async handleGamCacheWrite(request: Request): Promise<Response> {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return this.json({ error: "bad_body" }, 400);
    }
    const entries = Array.isArray(body?.entries) ? body.entries : [];
    const cachedAt = Date.now();
    let written = 0;
    for (const raw of entries) {
      const kind = raw?.kind as GamCacheKind;
      const id = String(raw?.id || "").trim();
      const name = String(raw?.name || "").trim();
      if (!kind || !id || !name) continue;
      this.state.storage.sql.exec(
        `INSERT INTO gam_cache (kind, external_id, display_name, cached_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(kind, external_id) DO UPDATE SET
           display_name = excluded.display_name,
           cached_at = excluded.cached_at`,
        kind,
        id,
        name.slice(0, 200),
        cachedAt
      );
      written++;
    }
    return this.json({ written });
  }

  private handleGamCacheList(): Response {
    const rows = this.state.storage.sql
      .exec<GamCacheRow>(
        `SELECT kind, external_id, display_name FROM gam_cache ORDER BY kind, display_name`
      )
      .toArray();
    const entries = rows.map((row) => ({
      kind: row.kind as GamCacheKind,
      id: row.external_id,
      name: row.display_name,
    }));
    return this.json({ entries });
  }

  private readAll(): ExtractedPerson[] {
    const rows = this.state.storage.sql
      .exec<PersonRow>(`SELECT append_order, person_json FROM persons ORDER BY append_order ASC`)
      .toArray();
    const persons: ExtractedPerson[] = [];
    for (const row of rows) {
      if (!row.person_json) continue;
      try {
        const person = JSON.parse(row.person_json) as ExtractedPerson;
        if (person && Array.isArray(person.claims)) persons.push(person);
      } catch {
        // skip an unparseable row rather than failing the whole read
      }
    }
    return persons;
  }

  private broadcast(message: string): void {
    for (const ws of this.state.getWebSockets()) {
      try {
        ws.send(message);
      } catch {
        // socket is dead; the runtime will reap it
      }
    }
  }

  private json(payload: unknown, status = 200): Response {
    return new Response(JSON.stringify(payload), {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }
}
