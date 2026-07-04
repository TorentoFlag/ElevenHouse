import { describe, expect, it } from "vitest";
import {
  collectProductCreateInvariantIssues,
  collectProductModifierInvariantIssues,
  collectProductUpdateInvariantIssues,
  productPaymentModelValues,
  productStatusValues
} from "./index";

describe("product validation taxonomy", () => {
  it("exports product taxonomy values as stable readonly tuples", () => {
    expect(productStatusValues).toEqual(["draft", "active", "archived"]);
    expect(productPaymentModelValues).toEqual(["once", "pack", "sub", "free"]);
  });
});

describe("product invariant validation", () => {
  it("collects create-time payment and participant issues", () => {
    expect(
      collectProductCreateInvariantIssues({
        paymentModel: "pack",
        packageSessionCount: null,
        participantMode: "group",
        groupSize: null,
        priceMinor: 100,
        deliveryFormats: ["video"],
        requiredClientData: [],
        methods: [],
        accessGrants: []
      })
    ).toEqual([
      {
        path: ["packageSessionCount"],
        message: "Package products require packageSessionCount"
      },
      {
        path: ["groupSize"],
        message: "Group products require groupSize"
      }
    ]);
  });

  it("collects duplicate enum-array issues for create and update payloads", () => {
    expect(
      collectProductUpdateInvariantIssues({
        deliveryFormats: ["video", "video"],
        methods: ["natal", "natal"]
      })
    ).toEqual([
      {
        path: ["deliveryFormats"],
        message: "Product delivery formats must be unique"
      },
      {
        path: ["methods"],
        message: "Product methods must be unique"
      }
    ]);
  });

  it("collects free-price issues for products and modifiers", () => {
    expect(
      collectProductCreateInvariantIssues({
        paymentModel: "free",
        priceMinor: 1
      })
    ).toEqual([
      {
        path: ["priceMinor"],
        message: "Free products must have zero price"
      }
    ]);

    expect(
      collectProductModifierInvariantIssues({
        kind: "free",
        priceMinor: 1
      })
    ).toEqual([
      {
        path: ["priceMinor"],
        message: "Free modifiers must have zero price"
      }
    ]);
  });

  it("collects out-of-range percent modifier issues", () => {
    expect(
      collectProductModifierInvariantIssues({
        kind: "percent",
        priceMinor: 101
      })
    ).toEqual([
      {
        path: ["priceMinor"],
        message: "Percent modifiers must be from 0 to 100"
      }
    ]);
  });
});
