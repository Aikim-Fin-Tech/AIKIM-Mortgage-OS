import { describe, expect, it, vi } from "vitest";
import type { GoogleGenerativeAI } from "@google/generative-ai";

// gemini-provider.ts imports "server-only", which throws outside Next's
// server bundling (vitest has no config stubbing it) — stubbed here only,
// scoped to this test file.
vi.mock("server-only", () => ({}));

const { GeminiOCRProvider } = await import("./gemini-provider");

/**
 * Regression test for the model-ID deprecation incident (gemini-2.5-pro
 * returned HTTP 404 "no longer available to new users"). Asserts the exact
 * model ID this provider requests from the SDK, so a future accidental edit
 * or another provider-side deprecation is caught here rather than discovered
 * live via a failed classification.
 */

const fakeFile = { bytes: new Uint8Array([1, 2, 3]), mimeType: "application/pdf" };

function fakeClient(getGenerativeModel: ReturnType<typeof vi.fn>): GoogleGenerativeAI {
  return { getGenerativeModel } as unknown as GoogleGenerativeAI;
}

describe("GeminiOCRProvider model id", () => {
  it("requests gemini-3.5-flash for classify()", async () => {
    const getGenerativeModel = vi.fn().mockReturnValue({
      generateContent: async () => ({
        response: { text: () => JSON.stringify({ predictedKind: "salary_slip", confidence: 0.9 }) },
      }),
    });
    const provider = new GeminiOCRProvider(fakeClient(getGenerativeModel));

    await provider.classify(fakeFile);

    expect(getGenerativeModel).toHaveBeenCalledWith(expect.objectContaining({ model: "gemini-3.5-flash" }));
  });

  it("requests gemini-3.5-flash for extract()", async () => {
    const getGenerativeModel = vi.fn().mockReturnValue({
      generateContent: async () => ({
        response: { text: () => JSON.stringify({ confidence: 0.9 }) },
      }),
    });
    const provider = new GeminiOCRProvider(fakeClient(getGenerativeModel));

    await provider.extract("salary_slip", fakeFile);

    expect(getGenerativeModel).toHaveBeenCalledWith(expect.objectContaining({ model: "gemini-3.5-flash" }));
  });
});
