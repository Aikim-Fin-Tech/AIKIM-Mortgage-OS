import { describe, expect, it } from "vitest";
import { classifyAndResolveDocumentType, type ClassifyAndResolveDocumentTypeDeps } from "./classify-and-resolve-document-type";

/**
 * Unit tests for the upload-time classify → decide → resolve pipeline.
 * Dependencies are injected as plain functions (no vi.mock(), no Supabase or
 * Gemini client involved) — this is the same "never throws, degrades to
 * null" contract recordDocumentUpload relies on to guarantee a classification
 * failure can never fail the upload itself.
 */

const fakeFile = { bytes: new Uint8Array([1, 2, 3]), mimeType: "application/pdf" };

function deps(overrides: Partial<ClassifyAndResolveDocumentTypeDeps>): ClassifyAndResolveDocumentTypeDeps {
  return {
    classify: async () => ({ predictedKind: "salary_slip", confidence: 0.95, modelName: "test", error: null }),
    resolve: async () => ({ status: "resolved", documentTypeId: "type-id-123" }),
    ...overrides,
  };
}

describe("classifyAndResolveDocumentType", () => {
  it("returns the resolved document type id for a high-confidence, recognized kind", async () => {
    const result = await classifyAndResolveDocumentType(fakeFile, deps({}));
    expect(result).toBe("type-id-123");
  });

  it("returns the resolved id at the confidence threshold boundary (inclusive)", async () => {
    const result = await classifyAndResolveDocumentType(
      fakeFile,
      deps({ classify: async () => ({ predictedKind: "bank_statement", confidence: 0.7, modelName: "test", error: null }) }),
    );
    expect(result).toBe("type-id-123");
  });

  it("returns null when confidence is below the threshold", async () => {
    const result = await classifyAndResolveDocumentType(
      fakeFile,
      deps({ classify: async () => ({ predictedKind: "salary_slip", confidence: 0.4, modelName: "test", error: null }) }),
    );
    expect(result).toBeNull();
  });

  it("returns null for predictedKind = 'unrecognized', even with high confidence", async () => {
    const result = await classifyAndResolveDocumentType(
      fakeFile,
      deps({ classify: async () => ({ predictedKind: "unrecognized", confidence: 0.99, modelName: "test", error: null }) }),
    );
    expect(result).toBeNull();
  });

  it("returns null when classify() reports a non-null error (no throw)", async () => {
    const result = await classifyAndResolveDocumentType(
      fakeFile,
      deps({ classify: async () => ({ predictedKind: "unrecognized", confidence: null, modelName: "unavailable", error: "provider not configured" }) }),
    );
    expect(result).toBeNull();
  });

  it("returns null, not a rejected promise, when classify() throws", async () => {
    const result = await classifyAndResolveDocumentType(
      fakeFile,
      deps({
        classify: async () => {
          throw new Error("GEMINI_API_KEY not configured");
        },
      }),
    );
    expect(result).toBeNull();
  });

  it("returns null when resolveDocumentTypeIdForKind() finds zero matches (unresolved)", async () => {
    const result = await classifyAndResolveDocumentType(
      fakeFile,
      deps({ resolve: async () => ({ status: "unresolved" }) }),
    );
    expect(result).toBeNull();
  });

  it("returns null, not a rejected promise, when resolveDocumentTypeIdForKind() throws (ambiguous match)", async () => {
    const result = await classifyAndResolveDocumentType(
      fakeFile,
      deps({
        resolve: async () => {
          throw new Error("2 document_types rows found — ambiguous, refusing to guess.");
        },
      }),
    );
    expect(result).toBeNull();
  });

  it("never calls resolve() when the decision is NEEDS_CONFIRMATION", async () => {
    let resolveCalled = false;
    await classifyAndResolveDocumentType(
      fakeFile,
      deps({
        classify: async () => ({ predictedKind: "unrecognized", confidence: null, modelName: "test", error: null }),
        resolve: async () => {
          resolveCalled = true;
          return { status: "resolved", documentTypeId: "should-not-be-used" };
        },
      }),
    );
    expect(resolveCalled).toBe(false);
  });
});
