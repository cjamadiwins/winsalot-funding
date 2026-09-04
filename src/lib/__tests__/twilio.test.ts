import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toE164, verifyTwilioSignature } from "../twilio";

describe("toE164", () => {
  it("adds +1 to a plain 10-digit number", () => {
    expect(toE164("4165551234")).toBe("+14165551234");
  });

  it("adds + to an 11-digit number starting with 1", () => {
    expect(toE164("14165551234")).toBe("+14165551234");
  });

  it("leaves an already-E.164 number untouched", () => {
    expect(toE164("+14165551234")).toBe("+14165551234");
  });

  it("strips formatting characters before converting", () => {
    expect(toE164("(416) 555-1234")).toBe("+14165551234");
  });
});

describe("verifyTwilioSignature", () => {
  const originalToken = process.env.TWILIO_AUTH_TOKEN;

  beforeEach(() => {
    process.env.TWILIO_AUTH_TOKEN = "test-auth-token";
  });

  afterEach(() => {
    process.env.TWILIO_AUTH_TOKEN = originalToken;
  });

  function signFor(url: string, params: Record<string, string>): string {
    const data =
      url +
      Object.keys(params)
        .sort()
        .map((key) => key + params[key])
        .join("");
    return createHmac("sha1", "test-auth-token").update(data, "utf8").digest("base64");
  }

  it("accepts a correctly-signed request", () => {
    const url = "https://growth.winsalotcorp.com/api/webhooks/twilio/status";
    const params = { MessageSid: "SM123", MessageStatus: "delivered" };
    const signature = signFor(url, params);
    expect(verifyTwilioSignature(url, params, signature)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const url = "https://growth.winsalotcorp.com/api/webhooks/twilio/status";
    const signature = signFor(url, { MessageSid: "SM123", MessageStatus: "delivered" });
    expect(verifyTwilioSignature(url, { MessageSid: "SM123", MessageStatus: "failed" }, signature)).toBe(false);
  });

  it("rejects a mismatched URL", () => {
    const params = { MessageSid: "SM123", MessageStatus: "delivered" };
    const signature = signFor("https://growth.winsalotcorp.com/api/webhooks/twilio/status", params);
    expect(verifyTwilioSignature("https://leads.winsalotcorp.com/api/webhooks/twilio/status", params, signature)).toBe(false);
  });

  it("rejects a missing signature header", () => {
    const url = "https://growth.winsalotcorp.com/api/webhooks/twilio/status";
    expect(verifyTwilioSignature(url, { MessageSid: "SM123" }, null)).toBe(false);
  });

  it("rejects when TWILIO_AUTH_TOKEN is not configured", () => {
    delete process.env.TWILIO_AUTH_TOKEN;
    const url = "https://growth.winsalotcorp.com/api/webhooks/twilio/status";
    const params = { MessageSid: "SM123" };
    const signature = signFor(url, params);
    expect(verifyTwilioSignature(url, params, signature)).toBe(false);
  });
});
