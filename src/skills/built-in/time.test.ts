import { describe, it, expect } from "bun:test";
import { timeSkill } from "./time";

// Resolve the tools from the skill (no context needed for time skill)
// @ts-expect-error - timeSkill requires no context fields
const tools = timeSkill({});
const getCurrentTime = tools.get_current_time!.execute!;
const dateDiff = tools.date_diff!.execute!;

const opts = {
  toolCallId: "test-call",
  messages: [] as never[],
  abortSignal: new AbortController().signal,
};

describe("timeSkill — get_current_time", () => {
  it("returns iso, unix, formatted, and timezone fields", async () => {
    const result = await getCurrentTime({ timezone: "UTC" }, opts);
    expect(result).toHaveProperty("iso");
    expect(result).toHaveProperty("unix");
    expect(result).toHaveProperty("formatted");
    expect(result).toHaveProperty("timezone", "UTC");
  });

  it("defaults to UTC when no timezone is provided", async () => {
    const result = await getCurrentTime({}, opts);
    expect(result.timezone).toBe("UTC");
  });

  it("accepts a valid IANA timezone", async () => {
    const result = await getCurrentTime({ timezone: "America/New_York" }, opts);
    expect(result.timezone).toBe("America/New_York");
    expect(result).not.toHaveProperty("error");
  });

  it("falls back to UTC and includes an error for an invalid timezone", async () => {
    const result = await getCurrentTime({ timezone: "Invalid/Zone" }, opts);
    expect(result.timezone).toBe("UTC");
    expect(result).toHaveProperty("error");
  });

  it("unix timestamp is close to Date.now()", async () => {
    const before = Date.now();
    const result = await getCurrentTime({}, opts);
    const after = Date.now();
    expect(result.unix).toBeGreaterThanOrEqual(before);
    expect(result.unix).toBeLessThanOrEqual(after);
  });

  it("iso string matches expected format", async () => {
    const result = await getCurrentTime({}, opts);
    expect(result.iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

describe("timeSkill — date_diff", () => {
  it("calculates exact day difference", async () => {
    const result = await dateDiff({ from: "2024-01-01", to: "2024-01-11" }, opts);
    expect(result.days).toBe(10);
    expect(result.hours).toBe(0);
    expect(result.minutes).toBe(0);
  });

  it("calculates negative difference when to < from", async () => {
    const result = await dateDiff({ from: "2024-01-11", to: "2024-01-01" }, opts);
    expect(result.days).toBe(-10);
    expect(result.totalMs).toBeLessThan(0);
  });

  it("calculates hours and minutes remainder", async () => {
    const result = await dateDiff(
      { from: "2024-01-01T00:00:00Z", to: "2024-01-01T01:30:00Z" },
      opts
    );
    expect(result.days).toBe(0);
    expect(result.hours).toBe(1);
    expect(result.minutes).toBe(30);
  });

  it("returns zero for equal dates", async () => {
    const result = await dateDiff({ from: "2024-06-15", to: "2024-06-15" }, opts);
    expect(result.days).toBe(0);
    expect(result.totalMs).toBe(0);
  });
});
