import "server-only";
import { SchemaType, type GoogleGenerativeAI, type Schema } from "@google/generative-ai";
import type {
  OCRClassificationResult,
  OCRDocumentKind,
  OCRExtractionResult,
  OCRFile,
  OCRProvider,
} from "./types";

const MODEL_NAME = "gemini-3.5-flash";

/**
 * Gemini 3.5 Flash implementation of OCRProvider. Uses Gemini's structured
 * output mode (responseSchema) so the model is constrained to return exactly
 * the shape we ask for — "Structured JSON" per the architecture, not free
 * text we then have to parse/guess at.
 *
 * Never fabricates a value: every field is nullable in the schema, and the
 * prompts explicitly instruct the model to return null rather than guess
 * when a field isn't legible or present.
 *
 * Sprint 2 (docs/decisions/0016-...) widened SCHEMAS/PROMPTS to 6 kinds and
 * added a sibling `confidence` property to every extraction schema, plus a
 * single, kind-agnostic classification schema/prompt for `classify()`.
 */

const SCHEMAS: Record<OCRDocumentKind, Schema> = {
  nric: {
    type: SchemaType.OBJECT,
    properties: {
      nricNumber: { type: SchemaType.STRING, nullable: true, description: "The 12-digit NRIC number, digits only, no dashes." },
      fullName: { type: SchemaType.STRING, nullable: true, description: "Full name exactly as printed on the card." },
      dateOfBirth: { type: SchemaType.STRING, nullable: true, description: "Date of birth as an ISO date (YYYY-MM-DD) only if printed or reliably derivable from a printed date on the card; otherwise null." },
      gender: { type: SchemaType.STRING, nullable: true, description: "Gender/sex only if explicitly printed on the card; never inferred from the NRIC number itself." },
      address: { type: SchemaType.STRING, nullable: true, description: "Residential address exactly as printed, if present." },
      confidence: { type: SchemaType.NUMBER, nullable: false, description: "Your confidence in this extraction overall, from 0 to 1." },
    },
    required: ["nricNumber", "fullName", "dateOfBirth", "gender", "address", "confidence"],
  },
  salary_slip: {
    type: SchemaType.OBJECT,
    properties: {
      employerName: { type: SchemaType.STRING, nullable: true, description: "Employer/company name as printed." },
      basicSalary: { type: SchemaType.NUMBER, nullable: true, description: "Basic salary amount, numeric only, no currency symbol." },
      netSalary: { type: SchemaType.NUMBER, nullable: true, description: "Net (take-home) salary amount, numeric only." },
      customerName: { type: SchemaType.STRING, nullable: true, description: "Employee/customer name exactly as printed." },
      salaryMonth: { type: SchemaType.STRING, nullable: true, description: "The pay period this slip covers, as printed (e.g. 'July 2026')." },
      overtime: { type: SchemaType.NUMBER, nullable: true, description: "Overtime pay amount, numeric only." },
      allowance: { type: SchemaType.NUMBER, nullable: true, description: "Total allowance amount, numeric only." },
      commission: { type: SchemaType.NUMBER, nullable: true, description: "Commission amount, numeric only." },
      bonus: { type: SchemaType.NUMBER, nullable: true, description: "Bonus amount, numeric only." },
      grossIncome: { type: SchemaType.NUMBER, nullable: true, description: "Gross income amount, numeric only." },
      epfEmployeeContribution: { type: SchemaType.NUMBER, nullable: true, description: "EPF contribution deducted from the employee, numeric only." },
      epfEmployerContribution: { type: SchemaType.NUMBER, nullable: true, description: "EPF contribution paid by the employer, numeric only." },
      confidence: { type: SchemaType.NUMBER, nullable: false, description: "Your confidence in this extraction overall, from 0 to 1." },
    },
    required: [
      "employerName",
      "basicSalary",
      "netSalary",
      "customerName",
      "salaryMonth",
      "overtime",
      "allowance",
      "commission",
      "bonus",
      "grossIncome",
      "epfEmployeeContribution",
      "epfEmployerContribution",
      "confidence",
    ],
  },
  bank_statement: {
    type: SchemaType.OBJECT,
    properties: {
      accountHolder: { type: SchemaType.STRING, nullable: true, description: "Name of the account holder as printed." },
      bankName: { type: SchemaType.STRING, nullable: true, description: "Name of the bank issuing the statement." },
      accountNumberMasked: { type: SchemaType.STRING, nullable: true, description: "Account number with all but the last 4 digits replaced by 'X' (e.g. 'XXXXXXXX1234') — never return the full unmasked account number." },
      statementPeriod: { type: SchemaType.STRING, nullable: true, description: "The statement period as printed (e.g. '1 July 2026 - 31 July 2026')." },
      detectedSalaryCredits: {
        type: SchemaType.ARRAY,
        nullable: true,
        description: "Transactions that look like a recurring salary credit, in order of appearance.",
        items: {
          type: SchemaType.OBJECT,
          properties: {
            description: { type: SchemaType.STRING, nullable: true, description: "Transaction description as printed." },
            amount: { type: SchemaType.NUMBER, nullable: true, description: "Credit amount, numeric only." },
            date: { type: SchemaType.STRING, nullable: true, description: "ISO date (YYYY-MM-DD) if legible." },
          },
          required: ["description", "amount", "date"],
        },
      },
      detectedRecurringIncomeCredits: {
        type: SchemaType.ARRAY,
        nullable: true,
        description: "Other transactions that look like recurring (non-salary) income credits, in order of appearance.",
        items: {
          type: SchemaType.OBJECT,
          properties: {
            description: { type: SchemaType.STRING, nullable: true, description: "Transaction description as printed." },
            amount: { type: SchemaType.NUMBER, nullable: true, description: "Credit amount, numeric only." },
            date: { type: SchemaType.STRING, nullable: true, description: "ISO date (YYYY-MM-DD) if legible." },
          },
          required: ["description", "amount", "date"],
        },
      },
      confidence: { type: SchemaType.NUMBER, nullable: false, description: "Your confidence in this extraction overall, from 0 to 1." },
    },
    required: [
      "accountHolder",
      "bankName",
      "accountNumberMasked",
      "statementPeriod",
      "detectedSalaryCredits",
      "detectedRecurringIncomeCredits",
      "confidence",
    ],
  },
  epf_statement: {
    type: SchemaType.OBJECT,
    properties: {
      memberName: { type: SchemaType.STRING, nullable: true, description: "EPF member name as printed." },
      employer: { type: SchemaType.STRING, nullable: true, description: "Employer name as printed." },
      contributionPeriod: { type: SchemaType.STRING, nullable: true, description: "The contribution period covered, as printed." },
      employeeContribution: { type: SchemaType.NUMBER, nullable: true, description: "Employee's EPF contribution amount, numeric only." },
      employerContribution: { type: SchemaType.NUMBER, nullable: true, description: "Employer's EPF contribution amount, numeric only." },
      wageAmount: { type: SchemaType.NUMBER, nullable: true, description: "The wage/salary amount the contribution was calculated against, if stated, numeric only." },
      confidence: { type: SchemaType.NUMBER, nullable: false, description: "Your confidence in this extraction overall, from 0 to 1." },
    },
    required: ["memberName", "employer", "contributionPeriod", "employeeContribution", "employerContribution", "wageAmount", "confidence"],
  },
  employment_letter: {
    type: SchemaType.OBJECT,
    properties: {
      employeeName: { type: SchemaType.STRING, nullable: true, description: "Employee name as printed." },
      employer: { type: SchemaType.STRING, nullable: true, description: "Employer/company name as printed." },
      position: { type: SchemaType.STRING, nullable: true, description: "Job title/position as printed." },
      employmentStatus: { type: SchemaType.STRING, nullable: true, description: "Employment status as stated (e.g. 'permanent', 'contract')." },
      startDate: { type: SchemaType.STRING, nullable: true, description: "Employment start date as an ISO date (YYYY-MM-DD) if legible." },
      basicSalary: { type: SchemaType.NUMBER, nullable: true, description: "Basic salary amount stated in the letter, numeric only." },
      allowances: { type: SchemaType.NUMBER, nullable: true, description: "Total allowances stated in the letter, numeric only." },
      confirmationStatus: { type: SchemaType.STRING, nullable: true, description: "Confirmation/probation status only if explicitly stated (e.g. 'confirmed', 'on probation')." },
      confidence: { type: SchemaType.NUMBER, nullable: false, description: "Your confidence in this extraction overall, from 0 to 1." },
    },
    required: [
      "employeeName",
      "employer",
      "position",
      "employmentStatus",
      "startDate",
      "basicSalary",
      "allowances",
      "confirmationStatus",
      "confidence",
    ],
  },
  ea_form: {
    type: SchemaType.OBJECT,
    properties: {
      employeeName: { type: SchemaType.STRING, nullable: true, description: "Employee name as printed." },
      employer: { type: SchemaType.STRING, nullable: true, description: "Employer name as printed." },
      taxYear: { type: SchemaType.STRING, nullable: true, description: "The tax year this EA form covers, as printed (e.g. '2025')." },
      employmentIncome: { type: SchemaType.NUMBER, nullable: true, description: "Total employment income (gross remuneration), numeric only." },
      allowancesAndBenefits: { type: SchemaType.NUMBER, nullable: true, description: "Total allowances/benefits, numeric only, when extractable." },
      statutoryDeductions: { type: SchemaType.NUMBER, nullable: true, description: "Total statutory deductions (e.g. EPF), numeric only, when extractable." },
      confidence: { type: SchemaType.NUMBER, nullable: false, description: "Your confidence in this extraction overall, from 0 to 1." },
    },
    required: ["employeeName", "employer", "taxYear", "employmentIncome", "allowancesAndBenefits", "statutoryDeductions", "confidence"],
  },
};

const PROMPTS: Record<OCRDocumentKind, string> = {
  nric:
    "This image is a Malaysian NRIC (identity card). Extract the NRIC number, the full name exactly as printed, the date of birth (only if printed or reliably derivable from a printed date), gender (only if explicitly printed — never infer it from the NRIC number), and the address if present. If a field is not legible or not present, return null for it — never guess or invent a value. Also report your confidence in this extraction from 0 to 1.",
  salary_slip:
    "This image or PDF page is a Malaysian salary slip. Extract the employee/customer name, employer name, salary month/pay period, basic salary, overtime, allowance, commission, bonus, gross income, net (take-home) salary, EPF employee contribution, and EPF employer contribution. If a field is not legible or not present, return null for it — never guess or invent a value. Also report your confidence in this extraction from 0 to 1.",
  bank_statement:
    "This image or PDF page is a bank statement. Extract the account holder name, bank name, account number (masked — return only the last 4 digits, replacing the rest with 'X'; never return the full unmasked number), statement period, and lists of transactions that look like recurring salary credits or other recurring income credits (each with description, amount, and date). If a field is not legible or not present, return null for it — never guess or invent a value. Also report your confidence in this extraction from 0 to 1.",
  epf_statement:
    "This image or PDF page is a Malaysian EPF (Employees Provident Fund) statement. Extract the member name, employer name, contribution period, employee contribution amount, employer contribution amount, and the wage amount the contribution was calculated against if stated. If a field is not legible or not present, return null for it — never guess or invent a value. Also report your confidence in this extraction from 0 to 1.",
  employment_letter:
    "This image or PDF page is an employment confirmation/offer letter. Extract the employee name, employer name, position/job title, employment status, start date, basic salary, allowances, and confirmation/probation status only if explicitly stated. If a field is not legible or not present, return null for it — never guess or invent a value. Also report your confidence in this extraction from 0 to 1.",
  ea_form:
    "This image or PDF page is a Malaysian EA Form (yearly employment income statement). Extract the employee name, employer name, tax year, total employment income, allowances/benefits where extractable, and statutory deductions where extractable. If a field is not legible or not present, return null for it — never guess or invent a value. Also report your confidence in this extraction from 0 to 1.",
};

const CLASSIFICATION_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    predictedKind: {
      type: SchemaType.STRING,
      nullable: false,
      format: "enum",
      enum: ["nric", "salary_slip", "bank_statement", "epf_statement", "employment_letter", "ea_form", "unrecognized"],
      description: "The document type you believe this is, or 'unrecognized' if it doesn't clearly match any of the supported types.",
    },
    confidence: { type: SchemaType.NUMBER, nullable: false, description: "Your confidence in this classification, from 0 to 1." },
  },
  required: ["predictedKind", "confidence"],
};

/**
 * Deliberately unprimed — see ADR 0016 Decision 1. Does not mention which
 * kind the uploader/human assigned; describes all 6 supported types plainly
 * so the model picks among them on the document's own content alone.
 */
const CLASSIFICATION_PROMPT =
  "Look at this document image or PDF page and decide what type of document it is, from the following supported types: " +
  "'nric' (a Malaysian NRIC identity card), " +
  "'salary_slip' (a payslip showing an employee's pay for a period), " +
  "'bank_statement' (a bank account statement showing transactions over a period), " +
  "'epf_statement' (a Malaysian EPF/Employees Provident Fund contribution statement), " +
  "'employment_letter' (an employer's letter confirming or offering employment), " +
  "'ea_form' (a Malaysian EA Form yearly employment income statement). " +
  "If the document does not clearly match any of these, respond with 'unrecognized'. " +
  "Also report your confidence in this classification from 0 to 1.";

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
      // confidence is a sibling signal, never mixed into the domain fields
      // object — see ADR 0016 Decision 2.
      const { confidence, ...fields } = parsed;

      return {
        kind,
        fields,
        confidence: typeof confidence === "number" ? confidence : null,
        modelName: MODEL_NAME,
        error: null,
      };
    } catch (unexpectedError) {
      const message = unexpectedError instanceof Error ? unexpectedError.message : "Unknown error";
      console.error(`[GeminiOCRProvider] extraction failed for kind=${kind}. message=${message}`);
      return { kind, fields: null, confidence: null, modelName: MODEL_NAME, error: message };
    }
  }

  async classify(file: OCRFile): Promise<OCRClassificationResult> {
    try {
      const model = this.client.getGenerativeModel({
        model: MODEL_NAME,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: CLASSIFICATION_SCHEMA,
        },
      });

      const result = await model.generateContent([
        { inlineData: { data: Buffer.from(file.bytes).toString("base64"), mimeType: file.mimeType } },
        { text: CLASSIFICATION_PROMPT },
      ]);

      const text = result.response.text();
      const parsed = JSON.parse(text);

      return {
        predictedKind: parsed.predictedKind,
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : null,
        modelName: MODEL_NAME,
        error: null,
      };
    } catch (unexpectedError) {
      const message = unexpectedError instanceof Error ? unexpectedError.message : "Unknown error";
      console.error(`[GeminiOCRProvider] classification failed. message=${message}`);
      return { predictedKind: "unrecognized", confidence: null, modelName: MODEL_NAME, error: message };
    }
  }
}
