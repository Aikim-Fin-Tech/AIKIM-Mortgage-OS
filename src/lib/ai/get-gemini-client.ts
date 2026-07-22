import "server-only";
import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Single shared construction point for the Gemini client — used by both OCR
 * (src/lib/ocr/gemini-provider.ts) and the AI Case Summary's next-action
 * generation (src/lib/case-summary/generate-next-action.ts), so the
 * "read GEMINI_API_KEY, fail loudly if missing" logic exists exactly once.
 */

let cachedClient: GoogleGenerativeAI | null = null;

export function getGeminiClient(): GoogleGenerativeAI {
  if (cachedClient) return cachedClient;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set. Add it to .env.local — see .env.local.example.");
  }

  cachedClient = new GoogleGenerativeAI(apiKey);
  return cachedClient;
}
