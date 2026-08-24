import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Regression guard for the blue brand theme (Primary #2563EB = Tailwind
 * blue-600, Hover #1D4ED8 = blue-700, Light background #EFF6FF = blue-50,
 * Light border #BFDBFE = blue-200). Scans component source text directly
 * rather than rendering, since these are plain Tailwind utility-class
 * strings, not exported constants — this is the smallest test that would
 * actually fail if a brand accent got reverted to emerald, or if the
 * semantic green/amber/red colors got accidentally swapped to blue too.
 */

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf-8");
}

describe("blue brand theme tokens", () => {
  it("Button's primary (default) variant uses the brand blue, not the old brand green", () => {
    const source = readSource("src/components/ui/button.tsx");
    expect(source).toMatch(/default:\s*"bg-blue-600[^"]*hover:bg-blue-700[^"]*"/);
    expect(source).not.toContain("bg-emerald-600 text-white hover:bg-emerald-700");
  });

  it("Input and Select focus states use blue, not the old brand green", () => {
    for (const path of ["src/components/ui/input.tsx", "src/components/ui/select.tsx"]) {
      const source = readSource(path);
      expect(source).toContain("focus:border-blue-500");
      expect(source).toContain("focus:ring-blue-500");
      expect(source).not.toContain("focus:border-emerald-500");
      expect(source).not.toContain("focus:ring-emerald-500");
    }
  });

  it("the login logo/wordmark uses the brand blue", () => {
    const source = readSource("src/app/login/page.tsx");
    expect(source).toContain("bg-blue-600");
    expect(source).toContain("text-blue-600");
    expect(source).not.toContain("emerald");
  });

  it("Sidebar's active-navigation state uses blue, not the old brand green", () => {
    const source = readSource("src/components/dashboard/Sidebar.tsx");
    expect(source).toContain("bg-blue-50 text-blue-700");
    expect(source).not.toContain("emerald");
  });

  it("semantic success (Badge) remains green, unaffected by the brand color change", () => {
    const source = readSource("src/components/ui/badge.tsx");
    expect(source).toContain('success: "bg-emerald-50 text-emerald-700"');
  });

  it("semantic warning/error color usages remain amber/rose, unaffected by the brand color change", () => {
    const badgeSource = readSource("src/components/ui/badge.tsx");
    expect(badgeSource).toContain("amber");
    expect(badgeSource).toContain("rose");
  });

  it("the Approved pipeline stage and the Loan Health Score's good tier remain semantic green", () => {
    expect(readSource("src/components/dashboard/LoanPipeline.tsx")).toContain('Approved: "bg-emerald-500"');
    expect(readSource("src/components/loan-cases/detail/LoanHealthScoreCard.tsx")).toContain("text-emerald-600");
  });
});
