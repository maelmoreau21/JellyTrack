import { describe, expect, it } from "vitest";
import { buildCsvRow, escapeCsvCell } from "./csv";

describe("CSV escaping", () => {
  it("quotes normal CSV metacharacters", () => {
    expect(escapeCsvCell('hello, "world"')).toBe('"hello, ""world"""');
  });

  it("prefixes spreadsheet formulas", () => {
    expect(escapeCsvCell("=WEBSERVICE(\"https://example.test\")")).toBe(
      '"\'=WEBSERVICE(""https://example.test"")"'
    );
    expect(escapeCsvCell("  +SUM(1,1)")).toBe('"\'  +SUM(1,1)"');
  });

  it("builds rows with each cell escaped independently", () => {
    expect(buildCsvRow(["safe", "@cmd", "a,b"])).toBe("safe,'@cmd,\"a,b\"");
  });
});
