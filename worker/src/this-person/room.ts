// this person — the repository Durable Object.
// One instance (fixed name) owns the append-only ledger of ExtractedPerson
// records in SQLite and broadcasts changes to every open wall over WebSocket.
//
// The repository contains only successful extracted portraits. Failed,
// canceled, refused, unsupported, and empty attempts never reach this class.
// It stores only the ExtractedPerson model — no IP, user agent, referrer,
// session, raw screenshot, raw archive, or raw OCR text.

import type { ExtractedPerson } from "./types";
import { zeroPad } from "./types";

interface PersonRow {
  append_order: number;
  person_json: string;
}

interface RoomEnv {
  THIS_PERSON_SHOW_TIME?: string;
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
    });
  }

  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path.endsWith("/socket")) return this.handleSocket(request);
    if (path.endsWith("/state")) return this.json({ persons: this.readAll() });
    if (path.endsWith("/append")) return this.handleAppend(request);
    if (path.endsWith("/enroll")) return this.handleEnroll(request);
    if (path.endsWith("/clear")) return this.handleClear();
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
