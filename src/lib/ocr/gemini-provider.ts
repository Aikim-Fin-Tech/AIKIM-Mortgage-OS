import "server-only";
import { SchemaType, type GoogleGenerativeAI, type Schema } from "@google/generative-ai";
import type { OCRDocumentKind, OCRExtractionResult, OCRFile, OCRProvider } from "./types";

const MODEL_NAME = "gemini-2.5-pro";

/**
 * Gemini 2.5 Pro implementation of OCRProvider. Uses Gemini's structured
 * output mode (responseSchema) so the model is constrained to return exactly
 * the shape we ask for — "Structured JSON" per the architecture, not free
 * text we then have to parse/guess at.
 *
 * Never fabricates a value: every field is nullable in the schema, and the
 * prompts explicitly instruct the model to return null rather than guess
 * when a field isn't legible or present.
 */

const SCHEMAS: Record<OCRDocumentKind, Schema> = {
  nric: {
    type: SchemaType.OBJECT,
    properties: {
      nricNumber: { type: SchemaType.STRING, nullable: true, description: "The 12-digit NRIC number, digits only, no dashes." },
      fullName: { type: SchemaType.STRING, nullable: true, description: "Full name exactly as printed on the card." },
    },
    required: ["nricNumber", "fullName"],
  },
  salary_slip: {
    type: SchemaType.OBJECT,
    properties: {
      employerName: { type: SchemaType.STRING, nullable: true, description: "Employer/company name as printed." },
      basicSalary: { type: SchemaType.NUMBER, nullable: true, description: "Basic salary amount, numeric only, no currency symbol." },
      netSalary: { type: SchemaType.NUMBER, nullable: true, description: "Net (take-home) salary amount, numeric only." },
    },
    required: ["employerName", "basicSalary", "netSalary"],
  },
};

const PROMPTS: Record<OCRDocumentKind, string> = {
  nric: "This image is a Malaysian NRIC (identity card). Extract the NRIC number and the full name exactly as printed. If a field is not legible or not present, return null for it — never guess or invent a value.",
  salary_slip: "This image or PDF page is a Malaysian salary slip. Extract the employer name, the basic salary, and the net (take-home) salary. If a field is not legible or not present, return null for it — never guess or invent a value.",
};

export class GeminiOCRProvider implements OCRProvider {
  constructor(private readonly client: GoogleGenerativeAI) {}

  async extract<K extends OCRDocumentKind>(kind: K, file: OCRFile): Promise<OCRExtractionResult<K>> {
    try {
      const model = this.client.getGenerativeModel({
        model: MODEL_NAME,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: SCHEMAS[kind],
        },
      });

      const result = await model.generateContent([
        { inlineData: { data: Buffer.from(file.bytes).toString("base64"), mimeType: file.mimeType } },
        { text: PROMPTS[kind] },
      ]);

      const text = result.response.text();
      const parsed = JSON.parse(text);

      return { kind, fields: parsed, modelName: MODEL_NAME, error: null };
    } catch (unexpectedError) {
      const message = unexpectedError instanceof Error ? unexpectedError.message : "Unknown error";
      console.error(`[GeminiOCRProvider] extraction failed for kind=${kind}. message=${message}`);
      return { kind, fields: null, modelName: MODEL_NAME, error: message };
    }
  }
}
