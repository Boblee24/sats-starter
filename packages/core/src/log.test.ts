import { describe, expect, it } from "vitest";
import { log, sanitize, setLogSink, type LogRecord } from "./log";

function capture(fn: () => void): LogRecord[] {
  const out: LogRecord[] = [];
  const restore = setLogSink((r) => out.push(r));
  try {
    fn();
  } finally {
    restore();
  }
  return out;
}

describe("log allowlist", () => {
  it("keeps allowlisted primitive fields", () => {
    const [rec] = capture(() => log.info("pay.ok", { id: "abc", latencyMs: 120, status: "paid", count: 2 }));
    expect(rec).toMatchObject({ event: "pay.ok", id: "abc", latencyMs: 120, status: "paid", count: 2 });
  });

  it("drops every disallowed field", () => {
    const evil = {
      body: { text: "secret transcript" },
      ip: "10.0.0.1",
      lat: 14.7,
      lon: -17.4,
      image: "data:image/jpeg;base64,AAAA",
      audio: "T2dnUw==",
      transcript: "hello",
      nwc: "nostr+walletconnect://abc?secret=deadbeef",
      message: "free text",
    };
    const [rec] = capture(() => log.info("x", evil as never));
    expect(Object.keys(rec!).sort()).toEqual(["event", "level", "ts"]);
    expect(JSON.stringify(rec)).not.toMatch(/secret|10\.0\.0\.1|14\.7|base64|walletconnect|hello/);
  });

  it("drops unsafe values even in allowed fields", () => {
    expect(sanitize({ id: "nostr+walletconnect://x?secret=y" })).toEqual({});
    expect(sanitize({ id: "lnbc1" + "q".repeat(200) })).toEqual({});
    expect(sanitize({ code: "has spaces in it" })).toEqual({});
    expect(sanitize({ count: { nested: 1 } })).toEqual({});
    expect(sanitize({ latencyMs: Number.NaN })).toEqual({});
  });

  it("does not allow the event name to carry data", () => {
    const [rec] = capture(() => log.warn("user said: give me money http://x", {}));
    expect(rec!.event).toBe("invalid_event");
  });
});
