import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ipcChannels } from "../../ipc/contracts";
import { createValidatedIpcHandler } from "./router";

describe("createValidatedIpcHandler", () => {
  it("returns sanitized validation errors for invalid payloads", async () => {
    const handler = createValidatedIpcHandler(
      ipcChannels.connectionGet,
      z.object({ connectionId: z.string().min(1) }),
      (payload) => payload,
    );

    const response = await handler({ connectionId: "" });

    expect(response.ok).toBe(false);
    expect(response).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid IPC payload",
      },
    });
  });

  it("returns typed success envelopes for valid payloads", async () => {
    const handler = createValidatedIpcHandler(
      ipcChannels.healthPing,
      z.undefined(),
      () => ({ ok: true, appName: "Nexum", timestamp: "2026-06-02T00:00:00Z" }),
    );

    await expect(handler(undefined)).resolves.toMatchObject({
      ok: true,
      value: {
        appName: "Nexum",
        ok: true,
      },
    });
  });
});
