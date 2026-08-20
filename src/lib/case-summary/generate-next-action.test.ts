import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression test for the model-ID deprecation incident (gemini-2.5-pro
 * returned HTTP 404 "no longer available to new users"). generate-next-action
 * has no injectable client seam (unlike GeminiOCRProvider), so the shared
 * client module is mocked here specifically to intercept the model ID passed
 * to getGenerativeModel() — narrowly scoped to this one assertion, not a
 * general mocking pattern for this module.
 */

// generate-next-action.ts (and get-gemini-client.ts) import "server-only",
// which throws outside Next's server bundling (vitest has no config stubbing
// it) — stubbed here only, scoped to this test file.
vi.mock("server-only", () => ({}));

const getGenerativeModel = vi.fn();

vi.mock("@/lib/ai/get-gemini-client", () => ({
  getGeminiClient: () => ({ getGenerativeModel }),
}));

const { generateNextAction } = await import("./generate-next-action");

describe("generateNextAction model id", () => {
  beforeEach(() => {
    getGenerativeModel.mockReset();
  });

  it("requests gemini-3.5-flash", async () => {
    getGenerativeModel.mockReturnValue({
      generateContent: async () => ({ response: { text: () => "Follow up with the customer." } }),
    });

    await generateNextAction({
      customerName: "Test Customer",
      employerName: null,
      basicSalary: null,
      netSalary: null,
      hasIncomeData: false,
      missingDocuments: [],
      stage: "New Enquiry",
      status: "New",
    });

    expect(getGenerativeModel).toHaveBeenCalledWith(expect.objectContaining({ model: "gemini-3.5-flash" }));
  });
});
