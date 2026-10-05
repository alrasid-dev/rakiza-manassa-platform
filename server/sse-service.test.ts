import { describe, expect, it, vi } from "vitest";
import { addSseClient, broadcastToUser, hasSseClients, removeSseClient } from "./sse-service";

describe("sse-service", () => {
  it("broadcasts to a user's clients and cleans up on removal", () => {
    const res = { write: vi.fn() } as unknown as { write: (chunk: string) => void };
    addSseClient(1, res);
    expect(hasSseClients(1)).toBe(true);

    broadcastToUser(1, { type: "attendance_confirmation" });
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('"type":"attendance_confirmation"'));

    removeSseClient(1, res);
    expect(hasSseClients(1)).toBe(false);
  });

  it("does not fail when broadcasting to a user with no clients", () => {
    expect(() => broadcastToUser(999, { type: "test" })).not.toThrow();
  });
});
