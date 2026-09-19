import { describe, expect, it } from "vitest";
import {
  defaultHiddenColumnFields,
  extraFieldColumnKey,
  extraFieldNameFromColumnKey,
  isColumnHidden,
  KNOWN_COLUMNS,
} from "../call-list-columns";

describe("KNOWN_COLUMNS", () => {
  it("includes every fixed target field plus Call Outcome and Callback", () => {
    const keys = KNOWN_COLUMNS.map((c) => c.key);
    expect(keys).toContain("business_name");
    expect(keys).toContain("notes");
    expect(keys).toContain("last_outcome");
    expect(keys).toContain("callback_at");
  });
});

describe("extraFieldColumnKey / extraFieldNameFromColumnKey", () => {
  it("round-trips an imported column name", () => {
    expect(extraFieldColumnKey("IS_WORDPRESS")).toBe("extra:IS_WORDPRESS");
    expect(extraFieldNameFromColumnKey("extra:IS_WORDPRESS")).toBe("IS_WORDPRESS");
  });

  it("never collides with a fixed field of the same name", () => {
    // A source file with its own "phone" header, mapped into extra_fields
    // under that same literal name, must not be indistinguishable from the
    // fixed phone column once prefixed.
    expect(extraFieldColumnKey("phone")).not.toBe("phone");
  });

  it("returns null for a column key that isn't an extra field", () => {
    expect(extraFieldNameFromColumnKey("business_name")).toBeNull();
  });
});

describe("isColumnHidden", () => {
  it("is true only for a key present in the hidden list", () => {
    const hidden = ["phone", "extra:IS_ROBOT"];
    expect(isColumnHidden(hidden, "phone")).toBe(true);
    expect(isColumnHidden(hidden, extraFieldColumnKey("IS_ROBOT"))).toBe(true);
    expect(isColumnHidden(hidden, "business_name")).toBe(false);
  });

  it("hides nothing when the list is empty", () => {
    expect(isColumnHidden([], "business_name")).toBe(false);
  });
});

describe("defaultHiddenColumnFields", () => {
  it("hides every given extra field and nothing else", () => {
    const result = defaultHiddenColumnFields(["IS_WORDPRESS", "IS_ROBOT", "yelp_rating"]);
    expect(result).toEqual(["extra:IS_WORDPRESS", "extra:IS_ROBOT", "extra:yelp_rating"]);
  });

  it("hides nothing when there are no extra fields", () => {
    expect(defaultHiddenColumnFields([])).toEqual([]);
  });
});
