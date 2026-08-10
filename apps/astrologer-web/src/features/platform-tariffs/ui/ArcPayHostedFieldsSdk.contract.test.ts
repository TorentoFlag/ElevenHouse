// @vitest-environment jsdom

import { ArcPay } from "@thavguard/arc-pay";
import { afterEach, describe, expect, it } from "vitest";

describe("ArcPay Hosted Fields SDK contract", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("supplies the merchant origin and public key when mounting a secure card iframe", async () => {
    const target = document.body.appendChild(document.createElement("div"));
    const provider = await ArcPay.load("pk_test_contract");
    const elements = provider.elements();

    elements.create("cardNumber").mount(target);

    const source = new URL(target.querySelector("iframe")?.src ?? "");
    expect(source.searchParams.get("parent_origin")).toBe(window.location.origin);
    expect(source.searchParams.get("publishable_key")).toBe("pk_test_contract");
  });
});
