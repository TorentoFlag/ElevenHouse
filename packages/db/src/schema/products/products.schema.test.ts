import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { products } from "./products.schema";

describe("products schema AstroDiary and revision boundary", () => {
  it("declares typed AstroDiary configuration and monotonic revision columns", () => {
    const config = getTableConfig(products);
    const columnNames = config.columns.map((column) => column.name);

    expect(columnNames).toEqual(
      expect.arrayContaining([
        "revision",
        "astro_diary_reflection_cycles_per_period",
        "astro_diary_response_sla_working_days",
        "astro_diary_client_response_window_calendar_days",
        "astro_diary_working_weekdays_mask",
        "astro_diary_service_timezone"
      ])
    );
    expect(config.checks.map((constraint) => constraint.name)).toEqual(
      expect.arrayContaining([
        "products_revision_check",
        "products_astro_diary_config_completeness_check",
        "products_astro_diary_shape_check",
        "products_astro_diary_reflection_cycles_check",
        "products_astro_diary_response_sla_check",
        "products_astro_diary_client_response_window_check",
        "products_astro_diary_working_weekdays_mask_check",
        "products_astro_diary_service_timezone_check"
      ])
    );
  });
});
