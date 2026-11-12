// The final-record card says "Not provided" for a field nobody filled, not a red "missing" tag.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FieldList } from "../src/components/record/FieldList";

describe("FieldList", () => {
  it("shows an unfilled field as Not provided, without the missing tag", () => {
    const html = renderToStaticMarkup(
      <FieldList fields={{ additionalNotes: { value: null, source: null, status: "missing" }, email: { value: "a@b.co", source: "chat", status: "valid" } }} />,
    );
    expect(html).toContain("Not provided");
    expect(html).not.toContain("missing");
    expect(html).toContain("a@b.co");
  });
});

describe("FieldList order and skipped fields", () => {
  it("lists a claim in reading order and says Not provided for a skipped field, not 'needs checking'", () => {
    const html = renderToStaticMarkup(
      <FieldList
        fields={{
          email: { value: "a@b.co", source: "chat", status: "valid" },
          additionalNotes: { value: null, source: "chat", status: "skipped" },
          deviceType: { value: "smartphone", source: "call", status: "valid" },
        }}
      />,
    );
    expect(html.indexOf("Device type")).toBeLessThan(html.indexOf("Email"));
    expect(html.indexOf("Email")).toBeLessThan(html.indexOf("Notes"));
    expect(html).toContain("Not provided");
    expect(html).not.toContain("needs checking");
  });
});
