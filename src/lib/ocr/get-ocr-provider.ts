import "server-only";
import { getGeminiClient } from "@/lib/ai/get-gemini-client";
import { GeminiOCRProvider } from "./gemini-provider";
import type { OCRProvider } from "./types";

/**
 * The one place the application asks for "the OCR provider." Swapping to a
 * different provider later means: implement OCRProvider in a new file, then
 * change the single line below that instantiates GeminiOCRProvider — no
 * caller of getOCRProvider() anywhere else in the app needs to change.
 */

let cachedProvider: OCRProvider | null = null;

export function getOCRProvider(): OCRProvider {
  if (cachedProvider) return cachedProvider;

  cachedProvider = new GeminiOCRProvider(getGeminiClient());
  return cachedProvider;
}
