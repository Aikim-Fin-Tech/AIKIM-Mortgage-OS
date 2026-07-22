import "server-only";
import { getGeminiClient } from "@/lib/ai/get-gemini-client";
import type { CaseSummaryData } from "./types";

const MODEL_NAME = "gemini-2.5-pro";

/**
 * The only AI-generated field on the Case Summary card — a short, concrete
 * suggestion for what the banker should do next. Generated on request (a
 * button click), not automatically on every page view, to keep cost/latency
 * predictable and give the banker control over when it re-runs. Never
 * stored — regenerated fresh each time, since the underlying case data can
 * change between requests.
 *
 * The prompt is deliberately restricted to the real data already gathered by
 * getCaseSummaryData — explicitly told never to invent facts not given here.
 */
export async function generateNextAction(data: CaseSummaryData): Promise<{ nextAction: string | null; error: string | null }> {
  try {
    const client = getGeminiClient();
    const model = client.getGenerativeModel({ model: MODEL_NAME });

    const prompt = `You are assisting a mortgage banker in Malaysia with one loan case. Based only on the facts below, suggest the single most important next action for the banker to take right now, in one short sentence (max 20 words). Never invent facts not given here — if income data is missing, say so rather than assuming a value.

Customer: ${data.customerName}
Employer: ${data.hasIncomeData ? (data.employerName ?? "Not stated on the salary slip") : "No salary slip processed yet"}
Basic Salary: ${data.hasIncomeData ? (data.basicSalary ?? "Not stated") : "Unknown"}
Net Salary: ${data.hasIncomeData ? (data.netSalary ?? "Not stated") : "Unknown"}
Missing Documents: ${data.missingDocuments.length > 0 ? data.missingDocuments.join(", ") : "None outstanding"}
Current Stage: ${data.stage}
Current Status: ${data.status}

Respond with only the suggested next action sentence — no preamble, no markdown.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    return { nextAction: text || null, error: text ? null : "The model returned an empty response." };
  } catch (unexpectedError) {
    const message = unexpectedError instanceof Error ? unexpectedError.message : "Unknown error";
    console.error(`[generateNextAction] failed. message=${message}`);
    return { nextAction: null, error: message };
  }
}
