import type { PlatformCapabilitySurface } from "./platform-capability-manifest";

type SurfaceCategory =
  | "navigation"
  | "frontendRoutes"
  | "readOperations"
  | "mutationOperations"
  | "workerJobs";

type AuditedSurface = PlatformCapabilitySurface & {
  readonly featureCode: string;
  readonly category: SurfaceCategory;
};

const audited = (
  featureCode: string,
  category: SurfaceCategory,
  id: string,
  ownerModule: string,
  sourcePath: string,
  identifier: string
): AuditedSurface => ({ featureCode, category, id, ownerModule, sourcePath, identifier });

const expectedAuditedSurfaces: readonly AuditedSurface[] = [
  audited(
    "engine",
    "navigation",
    "nav.engine",
    "astrologer-web.astrologerCopyByLocale",
    "apps/astrologer-web/src/common/i18n/astrologerCopy.ts",
    "navigation.items[id=chartEngine,href=/chart-engine]"
  ),
  audited(
    "engine",
    "frontendRoutes",
    "route.engine",
    "astrologer-web.astrologerRoutes",
    "apps/astrologer-web/src/router.tsx",
    "/chart-engine"
  ),
  audited(
    "engine",
    "readOperations",
    "engine.chart-job.read",
    "astrologer-api.ChartsModule",
    "apps/astrologer-api/src/modules/charts/charts.controller.ts",
    "GET /charts/jobs/:jobId"
  ),
  audited(
    "engine",
    "readOperations",
    "engine.chart-result.read",
    "astrologer-api.ChartsModule",
    "apps/astrologer-api/src/modules/charts/charts.controller.ts",
    "GET /charts/calculations/:calculationId"
  ),
  audited(
    "engine",
    "readOperations",
    "engine.dictionary.by-codes.read",
    "astrologer-api.DictionaryModule",
    "apps/astrologer-api/src/modules/dictionary/dictionary.controller.ts",
    "GET /dictionary/entries/by-codes"
  ),
  audited(
    "engine",
    "mutationOperations",
    "engine.chart.recalculate",
    "astrologer-api.ChartsModule",
    "apps/astrologer-api/src/modules/charts/charts.controller.ts",
    "POST /charts/calculations/:calculationId/recalculate"
  ),
  audited(
    "engine",
    "workerJobs",
    "engine.chart.execute",
    "chart-worker.chart-calculation",
    "apps/chart-worker/src/chart-jobs.queue.ts",
    "chart.calculation/calculate-natal-chart"
  ),

  audited(
    "pdf",
    "readOperations",
    "pdf.chart.latest",
    "astrologer-api.ChartsModule",
    "apps/astrologer-api/src/modules/charts/charts-pdf.controller.ts",
    "GET /charts/calculations/:calculationId/report/pdf"
  ),
  audited(
    "pdf",
    "readOperations",
    "pdf.chart.download",
    "astrologer-api.ChartsModule",
    "apps/astrologer-api/src/modules/charts/charts-pdf.controller.ts",
    "GET /charts/calculations/:calculationId/report/pdf/:jobId/download"
  ),
  audited(
    "pdf",
    "readOperations",
    "pdf.matrix.latest",
    "astrologer-api.MatrixModule",
    "apps/astrologer-api/src/modules/matrix/matrix-pdf.controller.ts",
    "GET /matrix/calculations/:calculationId/report/pdf"
  ),
  audited(
    "pdf",
    "readOperations",
    "pdf.matrix.download",
    "astrologer-api.MatrixModule",
    "apps/astrologer-api/src/modules/matrix/matrix-pdf.controller.ts",
    "GET /matrix/calculations/:calculationId/report/pdf/:jobId/download"
  ),
  audited(
    "pdf",
    "readOperations",
    "pdf.numerology.latest",
    "astrologer-api.NumerologyModule",
    "apps/astrologer-api/src/modules/numerology/numerology-pdf.controller.ts",
    "GET /numerology/calculations/:calculationId/report/pdf"
  ),
  audited(
    "pdf",
    "readOperations",
    "pdf.numerology.download",
    "astrologer-api.NumerologyModule",
    "apps/astrologer-api/src/modules/numerology/numerology-pdf.controller.ts",
    "GET /numerology/calculations/:calculationId/report/pdf/:jobId/download"
  ),
  audited(
    "pdf",
    "readOperations",
    "pdf.hd.latest",
    "astrologer-api.HumanDesignModule",
    "apps/astrologer-api/src/modules/human-design/human-design-pdf.controller.ts",
    "GET /human-design/calculations/:calculationId/report/pdf"
  ),
  audited(
    "pdf",
    "readOperations",
    "pdf.hd.download",
    "astrologer-api.HumanDesignModule",
    "apps/astrologer-api/src/modules/human-design/human-design-pdf.controller.ts",
    "GET /human-design/calculations/:calculationId/report/pdf/:jobId/download"
  ),
  audited(
    "pdf",
    "mutationOperations",
    "pdf.chart.enqueue",
    "astrologer-api.ChartsModule",
    "apps/astrologer-api/src/modules/charts/charts-pdf.controller.ts",
    "POST /charts/calculations/:calculationId/report/pdf"
  ),
  audited(
    "pdf",
    "mutationOperations",
    "pdf.matrix.enqueue",
    "astrologer-api.MatrixModule",
    "apps/astrologer-api/src/modules/matrix/matrix-pdf.controller.ts",
    "POST /matrix/calculations/:calculationId/report/pdf"
  ),
  audited(
    "pdf",
    "mutationOperations",
    "pdf.numerology.enqueue",
    "astrologer-api.NumerologyModule",
    "apps/astrologer-api/src/modules/numerology/numerology-pdf.controller.ts",
    "POST /numerology/calculations/:calculationId/report/pdf"
  ),
  audited(
    "pdf",
    "mutationOperations",
    "pdf.hd.enqueue",
    "astrologer-api.HumanDesignModule",
    "apps/astrologer-api/src/modules/human-design/human-design-pdf.controller.ts",
    "POST /human-design/calculations/:calculationId/report/pdf"
  ),
  audited(
    "pdf",
    "workerJobs",
    "pdf.render",
    "workers.calculation-pdf",
    "apps/workers/src/calculation-pdf/calculation-pdf.queue.ts",
    "calculation.pdf/render-calculation-pdf"
  ),

  audited(
    "natal",
    "mutationOperations",
    "natal.job.create",
    "astrologer-api.ChartsModule",
    "apps/astrologer-api/src/modules/charts/charts.controller.ts",
    "POST /charts/natal/jobs"
  ),
  audited(
    "synastry",
    "mutationOperations",
    "synastry.job.create",
    "astrologer-api.ChartsModule",
    "apps/astrologer-api/src/modules/charts/charts.controller.ts",
    "POST /charts/synastry/jobs"
  ),
  audited(
    "forecast",
    "mutationOperations",
    "forecast.transit.create",
    "astrologer-api.ChartsModule",
    "apps/astrologer-api/src/modules/charts/charts.controller.ts",
    "POST /charts/transits/jobs"
  ),
  audited(
    "forecast",
    "mutationOperations",
    "forecast.progression.create",
    "astrologer-api.ChartsModule",
    "apps/astrologer-api/src/modules/charts/charts.controller.ts",
    "POST /charts/progressions/jobs"
  ),
  audited(
    "solar",
    "mutationOperations",
    "solar.return.create",
    "astrologer-api.ChartsModule",
    "apps/astrologer-api/src/modules/charts/charts.controller.ts",
    "POST /charts/solar-return/jobs"
  ),

  audited(
    "matrix",
    "navigation",
    "nav.matrix",
    "astrologer-web.astrologerCopyByLocale",
    "apps/astrologer-web/src/common/i18n/astrologerCopy.ts",
    "navigation.items[id=destinyMatrix,href=/matrix]"
  ),
  audited(
    "matrix",
    "frontendRoutes",
    "route.matrix",
    "astrologer-web.astrologerRoutes",
    "apps/astrologer-web/src/router.tsx",
    "/matrix"
  ),
  audited(
    "matrix",
    "readOperations",
    "matrix.notes.list",
    "astrologer-api.MatrixModule",
    "apps/astrologer-api/src/modules/matrix/matrix-notes.controller.ts",
    "GET /matrix/calculations/:calculationId/notes"
  ),
  audited(
    "matrix",
    "readOperations",
    "matrix.interpretations.read",
    "astrologer-api.MatrixModule",
    "apps/astrologer-api/src/modules/matrix/matrix-notes.controller.ts",
    "GET /matrix/interpretations"
  ),
  audited(
    "matrix",
    "readOperations",
    "matrix.report.read",
    "astrologer-api.MatrixModule",
    "apps/astrologer-api/src/modules/matrix/matrix-report.controller.ts",
    "GET /matrix/calculations/:calculationId/report"
  ),
  audited(
    "matrix",
    "mutationOperations",
    "matrix.preview",
    "astrologer-api.MatrixModule",
    "apps/astrologer-api/src/modules/matrix/matrix.controller.ts",
    "POST /matrix/preview"
  ),
  audited(
    "matrix",
    "mutationOperations",
    "matrix.calculation.create",
    "astrologer-api.MatrixModule",
    "apps/astrologer-api/src/modules/matrix/matrix.controller.ts",
    "POST /matrix/calculations"
  ),
  audited(
    "matrix",
    "mutationOperations",
    "matrix.calculation.recalculate",
    "astrologer-api.MatrixModule",
    "apps/astrologer-api/src/modules/matrix/matrix.controller.ts",
    "POST /matrix/calculations/:calculationId/recalculate"
  ),
  audited(
    "matrix",
    "mutationOperations",
    "matrix.projection.generate",
    "astrologer-api.MatrixModule",
    "apps/astrologer-api/src/modules/matrix/matrix.controller.ts",
    "GET /matrix/calculations/:calculationId/projection"
  ),
  audited(
    "matrix",
    "mutationOperations",
    "matrix.note.create",
    "astrologer-api.MatrixModule",
    "apps/astrologer-api/src/modules/matrix/matrix-notes.controller.ts",
    "POST /matrix/calculations/:calculationId/notes"
  ),
  audited(
    "matrix",
    "mutationOperations",
    "matrix.note.update",
    "astrologer-api.MatrixModule",
    "apps/astrologer-api/src/modules/matrix/matrix-notes.controller.ts",
    "PUT /matrix/calculations/:calculationId/notes/:noteId"
  ),
  audited(
    "matrix",
    "mutationOperations",
    "matrix.note.delete",
    "astrologer-api.MatrixModule",
    "apps/astrologer-api/src/modules/matrix/matrix-notes.controller.ts",
    "DELETE /matrix/calculations/:calculationId/notes/:noteId"
  ),
  audited(
    "matrix",
    "mutationOperations",
    "matrix.report.save",
    "astrologer-api.MatrixModule",
    "apps/astrologer-api/src/modules/matrix/matrix-report.controller.ts",
    "PUT /matrix/calculations/:calculationId/report"
  ),

  audited(
    "numerology",
    "navigation",
    "nav.numerology",
    "astrologer-web.astrologerCopyByLocale",
    "apps/astrologer-web/src/common/i18n/astrologerCopy.ts",
    "navigation.items[id=numerology,href=/numerology]"
  ),
  audited(
    "numerology",
    "frontendRoutes",
    "route.numerology",
    "astrologer-web.astrologerRoutes",
    "apps/astrologer-web/src/router.tsx",
    "/numerology"
  ),
  audited(
    "numerology",
    "mutationOperations",
    "numerology.preview",
    "astrologer-api.NumerologyModule",
    "apps/astrologer-api/src/modules/numerology/numerology.controller.ts",
    "POST /numerology/preview"
  ),
  audited(
    "numerology",
    "mutationOperations",
    "numerology.calculation.create",
    "astrologer-api.NumerologyModule",
    "apps/astrologer-api/src/modules/numerology/numerology.controller.ts",
    "POST /numerology/calculations"
  ),
  audited(
    "numerology",
    "mutationOperations",
    "numerology.calculation.recalculate",
    "astrologer-api.NumerologyModule",
    "apps/astrologer-api/src/modules/numerology/numerology.controller.ts",
    "POST /numerology/calculations/:calculationId/recalculate"
  ),

  audited(
    "hd",
    "navigation",
    "nav.hd",
    "astrologer-web.astrologerCopyByLocale",
    "apps/astrologer-web/src/common/i18n/astrologerCopy.ts",
    "navigation.items[id=humanDesign,href=/human-design]"
  ),
  audited(
    "hd",
    "frontendRoutes",
    "route.hd",
    "astrologer-web.astrologerRoutes",
    "apps/astrologer-web/src/router.tsx",
    "/human-design"
  ),
  audited(
    "hd",
    "mutationOperations",
    "hd.preview",
    "astrologer-api.HumanDesignModule",
    "apps/astrologer-api/src/modules/human-design/human-design.controller.ts",
    "POST /human-design/preview"
  ),
  audited(
    "hd",
    "mutationOperations",
    "hd.calculation.create",
    "astrologer-api.HumanDesignModule",
    "apps/astrologer-api/src/modules/human-design/human-design.controller.ts",
    "POST /human-design/calculations"
  ),
  audited(
    "hd",
    "mutationOperations",
    "hd.calculation.recalculate",
    "astrologer-api.HumanDesignModule",
    "apps/astrologer-api/src/modules/human-design/human-design.controller.ts",
    "POST /human-design/calculations/:calculationId/recalculate"
  ),
  audited(
    "hd",
    "mutationOperations",
    "hd.transits.generate",
    "astrologer-api.HumanDesignModule",
    "apps/astrologer-api/src/modules/human-design/human-design.controller.ts",
    "GET /human-design/calculations/:calculationId/transits"
  ),
  audited(
    "horar",
    "mutationOperations",
    "horar.job.create",
    "astrologer-api.ChartsModule",
    "apps/astrologer-api/src/modules/charts/charts.controller.ts",
    "POST /charts/horary/jobs"
  ),

  audited(
    "astrocal",
    "navigation",
    "nav.astrocal",
    "astrologer-web.astrologerCopyByLocale",
    "apps/astrologer-web/src/common/i18n/astrologerCopy.ts",
    "navigation.items[id=astroCalendar,href=/astro-calendar]"
  ),
  audited(
    "astrocal",
    "frontendRoutes",
    "route.astrocal",
    "astrologer-web.astrologerRoutes",
    "apps/astrologer-web/src/router.tsx",
    "/astro-calendar"
  ),
  audited(
    "astrocal",
    "readOperations",
    "astrocal.range.read",
    "astrologer-api.AstroCalendarModule",
    "apps/astrologer-api/src/modules/astro-calendar/astro-calendar.controller.ts",
    "GET /astro-calendar/range"
  ),
  audited(
    "astrocal",
    "mutationOperations",
    "astrocal.generation.create",
    "astrologer-api.AstroCalendarModule",
    "apps/astrologer-api/src/modules/astro-calendar/astro-calendar.controller.ts",
    "POST /astro-calendar/generations"
  ),
  audited(
    "astrocal",
    "mutationOperations",
    "astrocal.generation.retry",
    "astrologer-api.AstroCalendarModule",
    "apps/astrologer-api/src/modules/astro-calendar/astro-calendar.controller.ts",
    "POST /astro-calendar/generations/:generationId/retry"
  ),
  audited(
    "astrocal",
    "workerJobs",
    "astrocal.generate",
    "chart-worker.chart-calculation",
    "apps/chart-worker/src/chart-jobs.queue.ts",
    "chart.calculation/generate-astro-calendar"
  ),

  audited(
    "products",
    "navigation",
    "nav.products",
    "astrologer-web.astrologerCopyByLocale",
    "apps/astrologer-web/src/common/i18n/astrologerCopy.ts",
    "navigation.items[id=products,href=/products]"
  ),
  audited(
    "products",
    "frontendRoutes",
    "route.products",
    "astrologer-web.astrologerRoutes",
    "apps/astrologer-web/src/router.tsx",
    "/products"
  ),
  audited(
    "products",
    "readOperations",
    "products.list",
    "astrologer-api.ProductsModule",
    "apps/astrologer-api/src/modules/products/products.controller.ts",
    "GET /products"
  ),
  audited(
    "products",
    "readOperations",
    "products.summary",
    "astrologer-api.ProductsModule",
    "apps/astrologer-api/src/modules/products/products.controller.ts",
    "GET /products/summary"
  ),
  audited(
    "products",
    "readOperations",
    "products.templates",
    "astrologer-api.ProductsModule",
    "apps/astrologer-api/src/modules/products/products.controller.ts",
    "GET /products/templates"
  ),
  audited(
    "products",
    "readOperations",
    "products.read",
    "astrologer-api.ProductsModule",
    "apps/astrologer-api/src/modules/products/products.controller.ts",
    "GET /products/:productId"
  ),
  audited(
    "products",
    "readOperations",
    "products.public-purchase-options.read",
    "public-api.ClientCommerceModule",
    "apps/public-api/src/modules/client-commerce/client-commerce.controller.ts",
    "GET /me/astrologers/:astrologerUserId/purchase-options"
  ),
  audited(
    "products",
    "readOperations",
    "products.public-available-slots.read",
    "public-api.ClientCommerceModule",
    "apps/public-api/src/modules/client-commerce/client-commerce.controller.ts",
    "GET /me/astrologers/:astrologerUserId/available-slots"
  ),
  audited(
    "products",
    "mutationOperations",
    "products.template-draft.create",
    "astrologer-api.ProductsModule",
    "apps/astrologer-api/src/modules/products/products.controller.ts",
    "POST /products/templates/:templateCode/drafts"
  ),
  audited(
    "products",
    "mutationOperations",
    "products.create",
    "astrologer-api.ProductsModule",
    "apps/astrologer-api/src/modules/products/products.controller.ts",
    "POST /products"
  ),
  audited(
    "products",
    "mutationOperations",
    "products.update",
    "astrologer-api.ProductsModule",
    "apps/astrologer-api/src/modules/products/products.controller.ts",
    "PUT /products/:productId"
  ),
  audited(
    "products",
    "mutationOperations",
    "products.publish",
    "astrologer-api.ProductsModule",
    "apps/astrologer-api/src/modules/products/products.controller.ts",
    "POST /products/:productId/publish"
  ),
  audited(
    "products",
    "mutationOperations",
    "products.move-to-draft",
    "astrologer-api.ProductsModule",
    "apps/astrologer-api/src/modules/products/products.controller.ts",
    "POST /products/:productId/move-to-draft"
  ),
  audited(
    "products",
    "mutationOperations",
    "products.archive",
    "astrologer-api.ProductsModule",
    "apps/astrologer-api/src/modules/products/products.controller.ts",
    "POST /products/:productId/archive"
  ),
  audited(
    "products",
    "mutationOperations",
    "products.duplicate",
    "astrologer-api.ProductsModule",
    "apps/astrologer-api/src/modules/products/products.controller.ts",
    "POST /products/:productId/duplicate"
  ),
  audited(
    "products",
    "mutationOperations",
    "products.public-order.create",
    "public-api.OrdersModule",
    "apps/public-api/src/modules/orders/orders.controller.ts",
    "POST /orders"
  ),

  audited(
    "calendar",
    "navigation",
    "nav.calendar",
    "astrologer-web.astrologerCopyByLocale",
    "apps/astrologer-web/src/common/i18n/astrologerCopy.ts",
    "navigation.items[id=calendar,href=/calendar]"
  ),
  audited(
    "calendar",
    "frontendRoutes",
    "route.calendar",
    "astrologer-web.astrologerRoutes",
    "apps/astrologer-web/src/router.tsx",
    "/calendar"
  ),
  audited(
    "calendar",
    "readOperations",
    "calendar.range.read",
    "astrologer-api.CalendarModule",
    "apps/astrologer-api/src/modules/calendar/calendar.controller.ts",
    "GET /calendar/range"
  ),
  audited(
    "calendar",
    "readOperations",
    "calendar.availability.read",
    "astrologer-api.AvailabilityModule",
    "apps/astrologer-api/src/modules/availability/availability.controller.ts",
    "GET /availability/schedules/default"
  ),
  audited(
    "calendar",
    "readOperations",
    "calendar.booking-slots.read",
    "astrologer-api.BookingsModule",
    "apps/astrologer-api/src/modules/bookings/bookings.controller.ts",
    "GET /bookings/available-slots"
  ),
  audited(
    "calendar",
    "readOperations",
    "calendar.booking.read",
    "astrologer-api.BookingsModule",
    "apps/astrologer-api/src/modules/bookings/bookings.controller.ts",
    "GET /bookings/:bookingId"
  ),
  audited(
    "calendar",
    "mutationOperations",
    "calendar.block.create",
    "astrologer-api.CalendarModule",
    "apps/astrologer-api/src/modules/calendar/calendar.controller.ts",
    "POST /calendar/blocks"
  ),
  audited(
    "calendar",
    "mutationOperations",
    "calendar.block.delete",
    "astrologer-api.CalendarModule",
    "apps/astrologer-api/src/modules/calendar/calendar.controller.ts",
    "DELETE /calendar/blocks/:blockId"
  ),
  audited(
    "calendar",
    "mutationOperations",
    "calendar.availability.update",
    "astrologer-api.AvailabilityModule",
    "apps/astrologer-api/src/modules/availability/availability.controller.ts",
    "PUT /availability/schedules/default"
  ),
  audited(
    "calendar",
    "mutationOperations",
    "calendar.manual-booking.create",
    "astrologer-api.BookingsModule",
    "apps/astrologer-api/src/modules/bookings/bookings.controller.ts",
    "POST /bookings/manual"
  ),
  audited(
    "calendar",
    "mutationOperations",
    "calendar.public-booking-intent.create",
    "public-api.BookingModule",
    "apps/public-api/src/modules/booking/booking.controller.ts",
    "POST /booking/intent"
  ),

  audited(
    "funnels",
    "navigation",
    "nav.funnels",
    "astrologer-web.astrologerCopyByLocale",
    "apps/astrologer-web/src/common/i18n/astrologerCopy.ts",
    "navigation.items[id=funnels,href=/flows]"
  ),
  audited(
    "funnels",
    "frontendRoutes",
    "route.funnels",
    "astrologer-web.astrologerRoutes",
    "apps/astrologer-web/src/router.tsx",
    "/flows"
  ),
  audited(
    "funnels",
    "readOperations",
    "funnels.templates.read",
    "astrologer-api.FlowsModule",
    "apps/astrologer-api/src/modules/flows/flows.controller.ts",
    "GET /flow-templates"
  ),
  audited(
    "funnels",
    "readOperations",
    "funnels.list",
    "astrologer-api.FlowsModule",
    "apps/astrologer-api/src/modules/flows/flows.controller.ts",
    "GET /flows"
  ),
  audited(
    "funnels",
    "readOperations",
    "funnels.read",
    "astrologer-api.FlowsModule",
    "apps/astrologer-api/src/modules/flows/flows.controller.ts",
    "GET /flows/:flowId"
  ),
  audited(
    "funnels",
    "readOperations",
    "funnels.enrollment.read",
    "astrologer-api.FlowsModule",
    "apps/astrologer-api/src/modules/flows/flow-enrollment.controller.ts",
    "GET /flows/:flowId/enrollment"
  ),
  audited(
    "funnels",
    "readOperations",
    "funnels.activation-review",
    "astrologer-api.FlowsModule",
    "apps/astrologer-api/src/modules/flows/flow-activation-review.controller.ts",
    "GET /flows/:flowId/activation-review"
  ),
  audited(
    "funnels",
    "readOperations",
    "funnels.runs.list",
    "astrologer-api.FlowsModule",
    "apps/astrologer-api/src/modules/flows/flows.controller.ts",
    "GET /flows/:flowId/runs"
  ),
  audited(
    "funnels",
    "readOperations",
    "funnels.run.read",
    "astrologer-api.FlowsModule",
    "apps/astrologer-api/src/modules/flows/flow-runs.controller.ts",
    "GET /flow-runs/:runId"
  ),
  audited(
    "funnels",
    "readOperations",
    "funnels.approvals.list",
    "astrologer-api.FlowsModule",
    "apps/astrologer-api/src/modules/flows/flow-approvals.controller.ts",
    "GET /flow-approvals"
  ),
  audited(
    "funnels",
    "readOperations",
    "funnels.work-items.list",
    "astrologer-api.FlowsModule",
    "apps/astrologer-api/src/modules/flows/flow-work-items.controller.ts",
    "GET /flow-work-items"
  ),
  audited(
    "funnels",
    "mutationOperations",
    "funnels.create",
    "astrologer-api.FlowsModule",
    "apps/astrologer-api/src/modules/flows/flows.controller.ts",
    "POST /flows"
  ),
  audited(
    "funnels",
    "mutationOperations",
    "funnels.validate",
    "astrologer-api.FlowsModule",
    "apps/astrologer-api/src/modules/flows/flows.controller.ts",
    "POST /flows/:flowId/validate"
  ),
  audited(
    "funnels",
    "mutationOperations",
    "funnels.draft.update",
    "astrologer-api.FlowsModule",
    "apps/astrologer-api/src/modules/flows/flows.controller.ts",
    "PATCH /flows/:flowId/draft"
  ),
  audited(
    "funnels",
    "mutationOperations",
    "funnels.publish",
    "astrologer-api.FlowsModule",
    "apps/astrologer-api/src/modules/flows/flows.controller.ts",
    "POST /flows/:flowId/publish"
  ),
  audited(
    "funnels",
    "mutationOperations",
    "funnels.next-draft.create",
    "astrologer-api.FlowsModule",
    "apps/astrologer-api/src/modules/flows/flows.controller.ts",
    "POST /flows/:flowId/next-draft"
  ),
  audited(
    "funnels",
    "mutationOperations",
    "funnels.activate",
    "astrologer-api.FlowsModule",
    "apps/astrologer-api/src/modules/flows/flow-enrollment.controller.ts",
    "POST /flows/:flowId/activate"
  ),
  audited(
    "funnels",
    "mutationOperations",
    "funnels.manual-client-run.create",
    "astrologer-api.FlowsModule",
    "apps/astrologer-api/src/modules/flows/flow-manual-client-runs.controller.ts",
    "POST /flows/:flowId/manual-runs"
  ),
  audited(
    "funnels",
    "mutationOperations",
    "funnels.pause",
    "astrologer-api.FlowsModule",
    "apps/astrologer-api/src/modules/flows/flow-enrollment.controller.ts",
    "POST /flows/:flowId/pause-enrollment"
  ),
  audited(
    "funnels",
    "mutationOperations",
    "funnels.run.cancel",
    "astrologer-api.FlowsModule",
    "apps/astrologer-api/src/modules/flows/flow-runs.controller.ts",
    "POST /flow-runs/:runId/cancel"
  ),
  audited(
    "funnels",
    "mutationOperations",
    "funnels.approval.decide",
    "astrologer-api.FlowsModule",
    "apps/astrologer-api/src/modules/flows/flow-approvals.controller.ts",
    "POST /flow-approvals/:approvalId/decision"
  ),
  audited(
    "funnels",
    "mutationOperations",
    "funnels.work-items.start",
    "astrologer-api.FlowsModule",
    "apps/astrologer-api/src/modules/flows/flow-work-items.controller.ts",
    "POST /flow-work-items/:workItemId/start"
  ),
  audited(
    "funnels",
    "mutationOperations",
    "funnels.work-items.snooze",
    "astrologer-api.FlowsModule",
    "apps/astrologer-api/src/modules/flows/flow-work-items.controller.ts",
    "POST /flow-work-items/:workItemId/snooze"
  ),
  audited(
    "funnels",
    "mutationOperations",
    "funnels.work-items.complete",
    "astrologer-api.FlowsModule",
    "apps/astrologer-api/src/modules/flows/flow-work-items.controller.ts",
    "POST /flow-work-items/:workItemId/complete"
  ),
  audited(
    "funnels",
    "workerJobs",
    "funnels.booking-confirmed-enrollment-dispatch",
    "workers.flows",
    "apps/workers/src/flows/flow-runtime.outbox-relay.ts",
    "flows.booking_confirmed.enrollment_requested.v1"
  ),
  audited(
    "funnels",
    "workerJobs",
    "funnels.booking-lifecycle-dispatch",
    "workers.flows",
    "apps/workers/src/flows/flow-runtime.outbox-relay.ts",
    "bookings.lifecycle_event.dispatch_requested.v1"
  ),

  audited(
    "ai",
    "mutationOperations",
    "ai.chart.draft",
    "astrologer-api.ChartsModule",
    "apps/astrologer-api/src/modules/charts/charts.controller.ts",
    "POST /charts/calculations/:calculationId/ai-draft"
  ),
  audited(
    "ai",
    "mutationOperations",
    "ai.matrix.draft",
    "astrologer-api.MatrixModule",
    "apps/astrologer-api/src/modules/matrix/matrix-report.controller.ts",
    "POST /matrix/calculations/:calculationId/report/ai-draft"
  ),
  audited(
    "ai",
    "mutationOperations",
    "ai.numerology.draft",
    "astrologer-api.NumerologyModule",
    "apps/astrologer-api/src/modules/numerology/numerology.controller.ts",
    "POST /numerology/calculations/:calculationId/ai-draft"
  ),
  audited(
    "ai",
    "mutationOperations",
    "ai.hd.draft",
    "astrologer-api.HumanDesignModule",
    "apps/astrologer-api/src/modules/human-design/human-design.controller.ts",
    "POST /human-design/calculations/:calculationId/ai-draft"
  ),
  audited(
    "ai",
    "mutationOperations",
    "ai.refs.draft",
    "astrologer-api.DictionaryAiModule",
    "apps/astrologer-api/src/modules/dictionary-ai/dictionary-ai.controller.ts",
    "POST /dictionary/ai-draft"
  ),

  audited(
    "inbox",
    "navigation",
    "nav.inbox",
    "astrologer-web.astrologerCopyByLocale",
    "apps/astrologer-web/src/common/i18n/astrologerCopy.ts",
    "navigation.items[id=inbox,href=/inbox]"
  ),
  audited(
    "inbox",
    "frontendRoutes",
    "route.inbox",
    "astrologer-web.astrologerRoutes",
    "apps/astrologer-web/src/router.tsx",
    "/inbox"
  ),
  audited(
    "inbox",
    "readOperations",
    "inbox.connections.list",
    "astrologer-api.MessagingModule",
    "apps/astrologer-api/src/modules/messaging/messaging.controller.ts",
    "GET /messaging/channel-connections"
  ),
  audited(
    "inbox",
    "readOperations",
    "inbox.threads.list",
    "astrologer-api.MessagingModule",
    "apps/astrologer-api/src/modules/messaging/messaging.controller.ts",
    "GET /messaging/threads"
  ),
  audited(
    "inbox",
    "readOperations",
    "inbox.thread.read",
    "astrologer-api.MessagingModule",
    "apps/astrologer-api/src/modules/messaging/messaging.controller.ts",
    "GET /messaging/threads/:threadId"
  ),
  audited(
    "inbox",
    "readOperations",
    "inbox.message-media.read",
    "astrologer-api.MessagingModule",
    "apps/astrologer-api/src/modules/messaging/messaging.controller.ts",
    "GET /messaging/messages/:messageId/media/source"
  ),
  audited(
    "inbox",
    "readOperations",
    "inbox.events.stream",
    "astrologer-api.MessagingModule",
    "apps/astrologer-api/src/modules/messaging/messaging-events.controller.ts",
    "SSE /messaging/events"
  ),
  audited(
    "inbox",
    "mutationOperations",
    "inbox.telegram-business.start",
    "astrologer-api.MessagingModule",
    "apps/astrologer-api/src/modules/messaging/messaging.controller.ts",
    "POST /messaging/channel-connections/telegram/business/start"
  ),
  audited(
    "inbox",
    "mutationOperations",
    "inbox.instagram-graph.start",
    "astrologer-api.MessagingModule",
    "apps/astrologer-api/src/modules/messaging/messaging.controller.ts",
    "POST /messaging/channel-connections/instagram/graph/start"
  ),
  audited(
    "inbox",
    "mutationOperations",
    "inbox.telegram-mtproto.start",
    "astrologer-api.MessagingModule",
    "apps/astrologer-api/src/modules/messaging/messaging.controller.ts",
    "POST /messaging/channel-connections/telegram/mtproto/start"
  ),
  audited(
    "inbox",
    "mutationOperations",
    "inbox.telegram-mtproto.code",
    "astrologer-api.MessagingModule",
    "apps/astrologer-api/src/modules/messaging/messaging.controller.ts",
    "POST /messaging/channel-connections/telegram/mtproto/code"
  ),
  audited(
    "inbox",
    "mutationOperations",
    "inbox.telegram-mtproto.password",
    "astrologer-api.MessagingModule",
    "apps/astrologer-api/src/modules/messaging/messaging.controller.ts",
    "POST /messaging/channel-connections/telegram/mtproto/password"
  ),
  audited(
    "inbox",
    "mutationOperations",
    "inbox.message.send",
    "astrologer-api.MessagingModule",
    "apps/astrologer-api/src/modules/messaging/messaging.controller.ts",
    "POST /messaging/threads/:threadId/messages"
  ),
  audited(
    "inbox",
    "mutationOperations",
    "inbox.thread.link-client",
    "astrologer-api.MessagingModule",
    "apps/astrologer-api/src/modules/messaging/messaging.controller.ts",
    "POST /messaging/threads/:threadId/link-client"
  ),
  audited(
    "inbox",
    "mutationOperations",
    "inbox.thread.create-client",
    "astrologer-api.MessagingModule",
    "apps/astrologer-api/src/modules/messaging/messaging.controller.ts",
    "POST /messaging/threads/:threadId/create-client"
  ),
  audited(
    "inbox",
    "mutationOperations",
    "inbox.thread.mark-read",
    "astrologer-api.MessagingModule",
    "apps/astrologer-api/src/modules/messaging/messaging.controller.ts",
    "POST /messaging/threads/:threadId/read"
  ),
  audited(
    "inbox",
    "workerJobs",
    "inbox.delivery",
    "notification-worker.messaging",
    "apps/notification-worker/src/messaging-delivery.queue.ts",
    "messaging.delivery/deliver-messaging-message"
  ),

  audited(
    "refs",
    "navigation",
    "nav.refs",
    "astrologer-web.astrologerCopyByLocale",
    "apps/astrologer-web/src/common/i18n/astrologerCopy.ts",
    "navigation.items[id=reference,href=/reference]"
  ),
  audited(
    "refs",
    "frontendRoutes",
    "route.refs",
    "astrologer-web.astrologerRoutes",
    "apps/astrologer-web/src/router.tsx",
    "/reference"
  ),
  audited(
    "refs",
    "readOperations",
    "refs.categories.list",
    "astrologer-api.DictionaryModule",
    "apps/astrologer-api/src/modules/dictionary/dictionary.controller.ts",
    "GET /dictionary/categories"
  ),
  audited(
    "refs",
    "readOperations",
    "refs.entries.list",
    "astrologer-api.DictionaryModule",
    "apps/astrologer-api/src/modules/dictionary/dictionary.controller.ts",
    "GET /dictionary/entries"
  ),
  audited(
    "refs",
    "mutationOperations",
    "refs.custom-entry.create",
    "astrologer-api.DictionaryModule",
    "apps/astrologer-api/src/modules/dictionary/dictionary.controller.ts",
    "POST /dictionary/custom-entries"
  ),
  audited(
    "refs",
    "mutationOperations",
    "refs.custom-entry.update",
    "astrologer-api.DictionaryModule",
    "apps/astrologer-api/src/modules/dictionary/dictionary.controller.ts",
    "PUT /dictionary/custom-entries/:entryId"
  ),
  audited(
    "refs",
    "mutationOperations",
    "refs.platform-entry.override",
    "astrologer-api.DictionaryModule",
    "apps/astrologer-api/src/modules/dictionary/dictionary.controller.ts",
    "PUT /dictionary/platform-entries/:platformEntryId/override"
  ),
  audited(
    "refs",
    "mutationOperations",
    "refs.entry.delete",
    "astrologer-api.DictionaryModule",
    "apps/astrologer-api/src/modules/dictionary/dictionary.controller.ts",
    "DELETE /dictionary/entries/:entryId"
  ),
  audited(
    "refs",
    "mutationOperations",
    "refs.entries.reset",
    "astrologer-api.DictionaryModule",
    "apps/astrologer-api/src/modules/dictionary/dictionary.controller.ts",
    "DELETE /dictionary/entries"
  ),
  audited(
    "refs",
    "mutationOperations",
    "refs.platform-entry.override-delete",
    "astrologer-api.DictionaryModule",
    "apps/astrologer-api/src/modules/dictionary/dictionary.controller.ts",
    "DELETE /dictionary/platform-entries/:platformEntryId/override"
  )
];

const expectedSharedSurfaces: readonly PlatformCapabilitySurface[] = [
  {
    id: "calculations.resource.list",
    ownerModule: "astrologer-api.CalculationsModule",
    sourcePath: "apps/astrologer-api/src/modules/calculations/calculations.controller.ts",
    identifier: "GET /calculations?module=<explicit module>"
  },
  {
    id: "calculations.resource.read",
    ownerModule: "astrologer-api.CalculationsModule",
    sourcePath: "apps/astrologer-api/src/modules/calculations/calculations.controller.ts",
    identifier: "GET /calculations/:calculationId"
  },
  {
    id: "calculations.resource.link-client",
    ownerModule: "astrologer-api.CalculationsModule",
    sourcePath: "apps/astrologer-api/src/modules/calculations/calculations.controller.ts",
    identifier: "POST /calculations/:calculationId/link-client"
  },
  {
    id: "calculations.resource.publish",
    ownerModule: "astrologer-api.CalculationsModule",
    sourcePath: "apps/astrologer-api/src/modules/calculations/calculations.controller.ts",
    identifier: "POST /calculations/:calculationId/publish"
  },
  {
    id: "calculations.resource.interpretation.create",
    ownerModule: "astrologer-api.CalculationsModule",
    sourcePath: "apps/astrologer-api/src/modules/calculations/calculations.controller.ts",
    identifier: "POST /calculations/:calculationId/interpretations"
  },
  {
    id: "calculations.resource.interpretation.approve",
    ownerModule: "astrologer-api.CalculationsModule",
    sourcePath: "apps/astrologer-api/src/modules/calculations/calculations.controller.ts",
    identifier: "POST /calculations/:calculationId/interpretations/:interpretationId/approve"
  },
  {
    id: "calculations.resource.archive",
    ownerModule: "astrologer-api.CalculationsModule",
    sourcePath: "apps/astrologer-api/src/modules/calculations/calculations.controller.ts",
    identifier: "POST /calculations/:calculationId/archive"
  },
  {
    id: "media.upload-intent.create",
    ownerModule: "astrologer-api.MediaModule",
    sourcePath: "apps/astrologer-api/src/modules/media/media.controller.ts",
    identifier: "POST /media/upload-intents"
  },
  {
    id: "media.upload.complete",
    ownerModule: "astrologer-api.MediaModule",
    sourcePath: "apps/astrologer-api/src/modules/media/media.controller.ts",
    identifier: "POST /media/:mediaId/complete"
  }
];

const expectedUnresolvedCapabilitySurfaces = [
  {
    id: "chart.astrocartography.create",
    ownerModule: "astrologer-api.ChartsModule",
    sourcePath: "apps/astrologer-api/src/modules/charts/charts.controller.ts",
    identifier: "POST /charts/astrocartography/jobs",
    reason:
      "Astrocartography has no approved tariff feature code and must not inherit forecast access.",
    publicationBlocker: true,
    candidateCapabilities: []
  },
  {
    id: "chart.composite.create",
    ownerModule: "astrologer-api.ChartsModule",
    sourcePath: "apps/astrologer-api/src/modules/charts/charts.controller.ts",
    identifier: "POST /charts/composite/jobs",
    reason: "Composite has no approved tariff feature code and must not inherit synastry access.",
    publicationBlocker: true,
    candidateCapabilities: []
  },
  {
    id: "chart.child-purpose",
    ownerModule: "astrologer-api.ChartsModule",
    sourcePath: "apps/astrologer-api/src/modules/charts/charts.controller.ts",
    identifier: "POST /charts/natal/jobs [server-visible child purpose missing]",
    reason:
      "Frontend child mode calls the ordinary natal command, so a tariff guard cannot distinguish child work.",
    publicationBlocker: true,
    candidateCapabilities: ["child", "natal"]
  },
  {
    id: "calculations.list-all.entitlement-projection",
    ownerModule: "astrologer-api.CalculationsModule",
    sourcePath: "apps/astrologer-api/src/modules/calculations/calculations.controller.ts",
    identifier: "GET /calculations?module=all",
    reason:
      "The default mixed collection needs per-row entitlement or historical-access projection before it can avoid cross-capability leakage.",
    publicationBlocker: true,
    candidateCapabilities: ["engine", "matrix", "numerology", "hd"]
  },
  {
    id: "inbox.paid-obligation-allow-rule",
    ownerModule: "astrologer-api.MessagingModule",
    sourcePath: "packages/domain/src/messaging/index.ts",
    identifier: "accepted queued message or already-paid obligation thread",
    reason:
      "Expiry must not prevent fulfillment of accepted delivery or an already-paid client obligation, but the persisted evidence policy is not wired.",
    publicationBlocker: true,
    candidateCapabilities: ["inbox"]
  }
] as const;

const exclusion = (
  id: string,
  ownerModule: string,
  sourcePath: string,
  identifier: string,
  reason: string
) => ({
  surface: { id, ownerModule, sourcePath, identifier },
  policy: "never_tariff_gate" as const,
  reason
});

const expectedSurfaceExclusions = [
  exclusion(
    "exclude.ui.root",
    "astrologer-web.astrologerRoutes",
    "apps/astrologer-web/src/router.tsx",
    "/ [Navigate replace -> /auth]",
    "The root redirect is routing infrastructure, not a sellable module."
  ),
  exclusion(
    "exclude.ui.not-found",
    "astrologer-web.astrologerRoutes",
    "apps/astrologer-web/src/router.tsx",
    "*",
    "The not-found route is routing infrastructure, not a sellable module."
  ),
  exclusion(
    "exclude.ui.dashboard",
    "astrologer-web.astrologerRoutes",
    "apps/astrologer-web/src/router.tsx",
    "/dashboard",
    "The authenticated workspace shell is baseline access, not a sellable module."
  ),
  exclusion(
    "exclude.ui.auth",
    "astrologer-web.astrologerRoutes",
    "apps/astrologer-web/src/router.tsx",
    "/auth",
    "Authentication must remain available independently of tariff state."
  ),
  exclusion(
    "exclude.ui.finance",
    "astrologer-web.astrologerRoutes",
    "apps/astrologer-web/src/router.tsx",
    "/finance",
    "Subscription and payout self-service cannot be hidden by the subscription it manages."
  ),
  exclusion(
    "exclude.ui.settings",
    "astrologer-web.astrologerRoutes",
    "apps/astrologer-web/src/router.tsx",
    "/settings",
    "Account settings are baseline access."
  ),
  exclusion(
    "exclude.nav.dashboard",
    "astrologer-web.astrologerCopyByLocale",
    "apps/astrologer-web/src/common/i18n/astrologerCopy.ts",
    "navigation.items[id=dashboard,href=/dashboard]",
    "The workspace dashboard navigation is baseline shell access."
  ),
  exclusion(
    "exclude.nav.personal-page",
    "astrologer-web.astrologerCopyByLocale",
    "apps/astrologer-web/src/common/i18n/astrologerCopy.ts",
    "navigation.personalPage[href=https://elevenhouse.app/alisa-vega]",
    "Viewing the direct public link is baseline access; creating or configuring a public page remains an absent capability."
  ),
  exclusion(
    "exclude.nav.finance",
    "astrologer-web.astrologerCopyByLocale",
    "apps/astrologer-web/src/common/i18n/astrologerCopy.ts",
    "navigation.items[id=finance,href=/finance]",
    "Finance navigation is baseline self-service, never a capability lock."
  ),
  exclusion(
    "exclude.nav.settings",
    "astrologer-web.astrologerCopyByLocale",
    "apps/astrologer-web/src/common/i18n/astrologerCopy.ts",
    "navigation.footerItems[id=settings,href=/settings]",
    "Settings navigation is baseline self-service, never a capability lock."
  ),
  exclusion(
    "exclude.ui.public-direct-link",
    "client-web.clientRoutes",
    "apps/client-web/src/router.tsx",
    "/a/:handle",
    "Direct-link client join is a core product invariant, not the absent PublicPage editor."
  ),
  exclusion(
    "exclude.tariffs.catalog.read",
    "astrologer-api.AstrologerTariffsModule",
    "apps/astrologer-api/src/modules/platform-tariffs/platform-tariffs.controller.ts",
    "GET /tariffs",
    "An owner must be able to inspect and select a tariff independently of its current tariff state."
  ),
  exclusion(
    "exclude.tariffs.entitlements.read",
    "astrologer-api.AstrologerTariffsModule",
    "apps/astrologer-api/src/modules/platform-tariffs/platform-tariffs.controller.ts",
    "GET /tariffs/entitlements",
    "The entitlement read-model is required to show locked states and recover access."
  ),
  exclusion(
    "exclude.tariffs.subscription.create",
    "astrologer-api.AstrologerTariffsModule",
    "apps/astrologer-api/src/modules/platform-tariffs/platform-tariffs.controller.ts",
    "POST /tariffs/subscriptions",
    "Subscription selection must remain available before an owner has an active tariff."
  ),
  exclusion(
    "exclude.tariffs.saved-card-disclosure.read",
    "astrologer-api.AstrologerTariffsModule",
    "apps/astrologer-api/src/modules/platform-tariffs/platform-tariffs.controller.ts",
    "GET /tariffs/subscriptions/:subscriptionId/saved-card-disclosure",
    "Saved-card disclosure is a payment-consent obligation, not a tariff capability."
  ),
  exclusion(
    "exclude.tariffs.saved-card-setup.create",
    "astrologer-api.AstrologerTariffsModule",
    "apps/astrologer-api/src/modules/platform-tariffs/platform-tariffs.controller.ts",
    "POST /tariffs/subscriptions/:subscriptionId/saved-card-setup",
    "Saved-card setup is required to pay for a tariff and cannot require that tariff first."
  ),
  exclusion(
    "exclude.tariffs.saved-card-setup.current.read",
    "astrologer-api.AstrologerTariffsModule",
    "apps/astrologer-api/src/modules/platform-tariffs/platform-tariffs.controller.ts",
    "GET /tariffs/subscriptions/:subscriptionId/saved-card-setup",
    "The owner must be able to resume a pending tariff payment setup."
  ),
  exclusion(
    "exclude.tariffs.saved-card-setup.execute",
    "astrologer-api.AstrologerTariffsModule",
    "apps/astrologer-api/src/modules/platform-tariffs/platform-tariffs.controller.ts",
    "POST /tariffs/saved-card-setups/:setupSessionId/execute",
    "Executing the saved-card setup is a tariff-payment continuation."
  ),
  exclusion(
    "exclude.tariffs.saved-card-setup.complete-3ds-method",
    "astrologer-api.AstrologerTariffsModule",
    "apps/astrologer-api/src/modules/platform-tariffs/platform-tariffs.controller.ts",
    "POST /tariffs/saved-card-setups/:setupSessionId/complete-3ds-method",
    "Completing a saved-card 3DS method is a tariff-payment continuation."
  ),
  exclusion(
    "exclude.tariffs.saved-card-setup.status.read",
    "astrologer-api.AstrologerTariffsModule",
    "apps/astrologer-api/src/modules/platform-tariffs/platform-tariffs.controller.ts",
    "GET /tariffs/saved-card-setups/:setupSessionId",
    "The owner must be able to inspect a pending saved-card setup."
  ),
  exclusion(
    "exclude.tariffs.invoice-payment.status.read",
    "astrologer-api.AstrologerTariffsModule",
    "apps/astrologer-api/src/modules/platform-tariffs/platform-tariffs.controller.ts",
    "GET /tariffs/invoices/:invoiceId/payment-status",
    "The owner must be able to inspect a tariff invoice payment outcome."
  ),
  exclusion(
    "exclude.tariffs.subscription-payment.status.read",
    "astrologer-api.AstrologerTariffsModule",
    "apps/astrologer-api/src/modules/platform-tariffs/platform-tariffs.controller.ts",
    "GET /tariffs/subscriptions/:subscriptionId/payment-status",
    "The owner must be able to inspect the current tariff payment outcome."
  ),
  exclusion(
    "exclude.tariffs.invoice-payment.complete-3ds-method",
    "astrologer-api.AstrologerTariffsModule",
    "apps/astrologer-api/src/modules/platform-tariffs/platform-tariffs.controller.ts",
    "POST /tariffs/invoices/:invoiceId/complete-3ds-method",
    "Completing tariff-invoice 3DS is a payment continuation, not a paid capability."
  ),
  exclusion(
    "exclude.finance.read",
    "astrologer-api.FinanceModule",
    "apps/astrologer-api/src/modules/finance/finance.controller.ts",
    "GET /finance/me",
    "Finance self-service is never tariff-gated."
  ),
  exclusion(
    "exclude.finance.operations",
    "astrologer-api.FinanceModule",
    "apps/astrologer-api/src/modules/finance/finance.controller.ts",
    "GET /finance/operations",
    "Financial history remains available for reconciliation and audit."
  ),
  exclusion(
    "exclude.finance.payout-method",
    "astrologer-api.FinanceModule",
    "apps/astrologer-api/src/modules/finance/finance.controller.ts",
    "POST /finance/payout-methods/manual-bank-transfer",
    "Payout configuration is a financial obligation, not a plan feature."
  ),
  exclusion(
    "exclude.finance.payout-request",
    "astrologer-api.FinanceModule",
    "apps/astrologer-api/src/modules/finance/finance.controller.ts",
    "POST /finance/payout-requests",
    "Owed-funds payout continuation must survive tariff expiry."
  ),
  exclusion(
    "exclude.bookings.cancel",
    "astrologer-api.BookingsModule",
    "apps/astrologer-api/src/modules/bookings/bookings.controller.ts",
    "POST /bookings/:bookingId/cancel",
    "Cancellation of an existing client booking must remain available after tariff expiry."
  ),
  exclusion(
    "exclude.bookings.complete",
    "astrologer-api.BookingsModule",
    "apps/astrologer-api/src/modules/bookings/bookings.controller.ts",
    "POST /bookings/:bookingId/complete",
    "Completion of an existing client booking must remain available after tariff expiry."
  ),
  exclusion(
    "exclude.bookings.reschedule",
    "astrologer-api.BookingsModule",
    "apps/astrologer-api/src/modules/bookings/bookings.controller.ts",
    "POST /bookings/:bookingId/reschedule",
    "Rescheduling an existing client booking must remain available after tariff expiry."
  ),
  exclusion(
    "exclude.profile.read",
    "astrologer-api.AstrologerProfileModule",
    "apps/astrologer-api/src/modules/astrologer-profile/astrologer-profile.controller.ts",
    "GET /astrologer-profile/me",
    "Account profile is baseline access."
  ),
  exclusion(
    "exclude.profile.update",
    "astrologer-api.AstrologerProfileModule",
    "apps/astrologer-api/src/modules/astrologer-profile/astrologer-profile.controller.ts",
    "PUT /astrologer-profile/me",
    "Account profile control is baseline access."
  ),
  exclusion(
    "exclude.verification.read",
    "astrologer-api.VerificationModule",
    "apps/astrologer-api/src/modules/verification/verification.controller.ts",
    "GET /verification/me",
    "Verification state is compliance infrastructure."
  ),
  exclusion(
    "exclude.verification.apply",
    "astrologer-api.VerificationModule",
    "apps/astrologer-api/src/modules/verification/verification.controller.ts",
    "POST /verification/applications",
    "Verification submission is compliance infrastructure."
  ),
  exclusion(
    "exclude.identity.astrologer.passwordless.request-code",
    "astrologer-api.IdentityModule",
    "apps/astrologer-api/src/modules/identity/passwordless/identity-passwordless.controller.ts",
    "POST /identity/astrologer/passwordless/request-code",
    "Authentication initiation must remain available independently of tariff state."
  ),
  exclusion(
    "exclude.identity.astrologer.passwordless.verify-code",
    "astrologer-api.IdentityModule",
    "apps/astrologer-api/src/modules/identity/passwordless/identity-passwordless.controller.ts",
    "POST /identity/astrologer/passwordless/verify-code",
    "Authentication verification must remain available independently of tariff state."
  ),
  exclusion(
    "exclude.identity.astrologer.registration.verify-code",
    "astrologer-api.IdentityModule",
    "apps/astrologer-api/src/modules/identity/registration/identity-registration.controller.ts",
    "POST /identity/astrologer/registration/passwordless/verify-code",
    "Account registration is identity infrastructure, not a tariff capability."
  ),
  exclusion(
    "exclude.identity.astrologer.current-account.read",
    "astrologer-api.IdentityModule",
    "apps/astrologer-api/src/modules/identity/session/identity-current-account.controller.ts",
    "GET /identity/me",
    "Current-account identity access must remain available independently of tariff state."
  ),
  exclusion(
    "exclude.identity.astrologer.logout",
    "astrologer-api.IdentityModule",
    "apps/astrologer-api/src/modules/identity/session/identity-session.controller.ts",
    "POST /identity/logout",
    "Session termination must never be tariff-gated."
  ),
  exclusion(
    "exclude.identity.public.passwordless.request-code",
    "public-api.IdentityModule",
    "apps/public-api/src/modules/identity/passwordless/identity-passwordless.controller.ts",
    "POST /identity/passwordless/request-code",
    "Client authentication initiation must remain available independently of astrologer tariff state."
  ),
  exclusion(
    "exclude.identity.public.passwordless.verify-code",
    "public-api.IdentityModule",
    "apps/public-api/src/modules/identity/passwordless/identity-passwordless.controller.ts",
    "POST /identity/passwordless/verify-code",
    "Client authentication verification must remain available independently of astrologer tariff state."
  ),
  exclusion(
    "exclude.identity.public.registration.verify-code",
    "public-api.IdentityModule",
    "apps/public-api/src/modules/identity/registration/identity-registration.controller.ts",
    "POST /identity/registration/passwordless/verify-code",
    "Client registration is identity infrastructure, not an astrologer tariff capability."
  ),
  exclusion(
    "exclude.identity.public.current-account.read",
    "public-api.IdentityModule",
    "apps/public-api/src/modules/identity/session/identity-current-account.controller.ts",
    "GET /identity/me",
    "Client-owned account access must remain available independently of astrologer tariff state."
  ),
  exclusion(
    "exclude.identity.public.logout",
    "public-api.IdentityModule",
    "apps/public-api/src/modules/identity/session/identity-session.controller.ts",
    "POST /identity/logout",
    "Client session termination must never be tariff-gated."
  ),
  exclusion(
    "exclude.health.astrologer-api",
    "astrologer-api.HealthModule",
    "apps/astrologer-api/src/modules/health/health.controller.ts",
    "GET /health",
    "Health probes are infrastructure."
  ),
  exclusion(
    "exclude.health.public-api",
    "public-api.HealthModule",
    "apps/public-api/src/modules/health/health.controller.ts",
    "GET /health",
    "Health probes are infrastructure."
  ),
  exclusion(
    "exclude.orders.public-order.read",
    "public-api.OrdersModule",
    "apps/public-api/src/modules/orders/orders.controller.ts",
    "GET /orders/:orderId",
    "An owner-scoped order read is a post-purchase obligation and must remain available after tariff expiry."
  ),
  exclusion(
    "exclude.payments.checkout",
    "public-api.PaymentsModule",
    "apps/public-api/src/modules/payments/payments.controller.ts",
    "POST /payments/checkout",
    "Checkout continues an accepted order using immutable order and entitlement snapshots."
  ),
  exclusion(
    "exclude.payments.checkout-state",
    "public-api.PaymentsModule",
    "apps/public-api/src/modules/payments/payments.controller.ts",
    "GET /payments/checkout-preparations/:checkoutPreparationId",
    "Reading an owner-scoped checkout preparation is a payment continuation using an immutable accepted order snapshot."
  ),
  exclusion(
    "exclude.payments.checkout-action",
    "public-api.PaymentsModule",
    "apps/public-api/src/modules/payments/payments.controller.ts",
    "GET /payments/checkout-preparations/:checkoutPreparationId/action",
    "Checkout action delivery continues an accepted order using the immutable checkout preparation and entitlement snapshots."
  ),
  exclusion(
    "exclude.auth-code.delivery",
    "notification-worker.auth-code-delivery",
    "apps/notification-worker/src/auth-code-delivery.queue.ts",
    "notifications.auth-code-delivery/deliver-passwordless-auth-code",
    "Authentication-code delivery is never a sellable capability."
  ),
  exclusion(
    "exclude.pdf.cleanup",
    "workers.calculation-pdf",
    "apps/workers/src/calculation-pdf/calculation-pdf.queue.ts",
    "calculation.pdf/delete-calculation-pdf",
    "Retention cleanup must run regardless of current tariff."
  ),
  exclusion(
    "exclude.messaging.oauth-callback",
    "astrologer-api.MessagingModule",
    "apps/astrologer-api/src/modules/messaging/instagram-graph-oauth.controller.ts",
    "GET /messaging/channel-connections/instagram/graph/callback",
    "A provider callback completes an already-started security ceremony and must not be tariff-gated."
  ),
  exclusion(
    "exclude.messaging.telegram-webhook",
    "astrologer-api.MessagingModule",
    "apps/astrologer-api/src/modules/messaging/messaging-webhooks.controller.ts",
    "POST /messaging/webhooks/telegram/bot",
    "Authenticated inbound provider traffic must be accepted for audit and existing obligations."
  ),
  exclusion(
    "exclude.messaging.instagram-webhook-verify",
    "astrologer-api.MessagingModule",
    "apps/astrologer-api/src/modules/messaging/messaging-webhooks.controller.ts",
    "GET /messaging/webhooks/instagram/graph",
    "Provider webhook verification is infrastructure, not a sellable user operation."
  ),
  exclusion(
    "exclude.messaging.instagram-webhook",
    "astrologer-api.MessagingModule",
    "apps/astrologer-api/src/modules/messaging/messaging-webhooks.controller.ts",
    "POST /messaging/webhooks/instagram/graph",
    "Authenticated inbound provider traffic must be accepted for audit and existing obligations."
  ),
  exclusion(
    "exclude.messaging.media-ingestion",
    "notification-worker.messaging-media-ingestion",
    "apps/notification-worker/src/messaging-media-ingestion.queue.ts",
    "messaging.media-ingestion/ingest-message-media",
    "Inbound media ingestion fulfills accepted provider traffic and must not be dropped after entitlement expiry."
  ),
  exclusion(
    "exclude.messaging.mtproto-inbound",
    "notification-worker.telegram-mtproto",
    "apps/notification-worker/src/telegram-mtproto-inbound.processor.ts",
    "processTelegramMtprotoInboundMessage",
    "Inbound session traffic is accepted protocol input, not a user-initiated new-work command."
  ),
  exclusion(
    "exclude.messaging.mtproto-supervision",
    "notification-worker.telegram-mtproto",
    "apps/notification-worker/src/telegram-mtproto-session-supervisor.ts",
    "TelegramMtprotoSessionSupervisor",
    "Provider session supervision is infrastructure and must not be torn down by a route entitlement check."
  ),
  exclusion(
    "exclude.clients.list",
    "astrologer-api.ClientsModule",
    "apps/astrologer-api/src/modules/clients/clients.controller.ts",
    "GET /clients",
    "Clients are shared chart, booking, calendar, and inbox foundations; the absent CRM product must not gate them."
  ),
  exclusion(
    "exclude.clients.birth-places",
    "astrologer-api.ClientsModule",
    "apps/astrologer-api/src/modules/clients/clients.controller.ts",
    "GET /clients/birth-places",
    "Birth-place lookup is shared calculation input infrastructure, not CRM access."
  ),
  exclusion(
    "exclude.clients.birth-places.geoapify-reference",
    "astrologer-api.ClientsModule",
    "apps/astrologer-api/src/modules/clients/clients.controller.ts",
    "GET /clients/birth-places/geoapify/:providerPlaceId",
    "Resolving a selected birth-place reference is shared calculation input infrastructure, not CRM access."
  ),
  exclusion(
    "exclude.clients.get",
    "astrologer-api.ClientsModule",
    "apps/astrologer-api/src/modules/clients/clients.controller.ts",
    "GET /clients/:clientUserId",
    "Client linkage is shared foundation data, not the absent CRM workspace."
  ),
  exclusion(
    "exclude.clients.birth-data.update",
    "astrologer-api.ClientsModule",
    "apps/astrologer-api/src/modules/clients/clients.controller.ts",
    "PUT /clients/:clientUserId/birth-data",
    "Birth data is user-owned calculation input and cannot be hidden by CRM tariff state."
  ),
  exclusion(
    "exclude.client-profile.astrologers",
    "public-api.ClientProfileModule",
    "apps/public-api/src/modules/client-profile/client-profile.controller.ts",
    "GET /me/astrologers",
    "The direct-link relationship cabinet is a client invariant, never an astrologer tariff surface."
  ),
  exclusion(
    "exclude.client-profile.overview",
    "public-api.ClientProfileModule",
    "apps/public-api/src/modules/client-profile/client-profile.controller.ts",
    "GET /me/overview",
    "Client-owned cabinet data must remain accessible independently of an astrologer tariff."
  ),
  exclusion(
    "exclude.client-profile.birth-data.get",
    "public-api.ClientProfileModule",
    "apps/public-api/src/modules/client-profile/client-profile.controller.ts",
    "GET /me/birth-data",
    "Client-owned sensitive data must not be hidden by an astrologer tariff."
  ),
  exclusion(
    "exclude.client-profile.birth-places",
    "public-api.ClientProfileModule",
    "apps/public-api/src/modules/client-profile/client-profile.controller.ts",
    "GET /me/birth-places",
    "Birth-place lookup is client calculation-input infrastructure, not an astrologer tariff benefit."
  ),
  exclusion(
    "exclude.client-profile.birth-data.update",
    "public-api.ClientProfileModule",
    "apps/public-api/src/modules/client-profile/client-profile.controller.ts",
    "PUT /me/birth-data",
    "Client control of their own data is not a tariff benefit."
  ),
  exclusion(
    "exclude.client-join.create",
    "public-api.ClientJoinModule",
    "apps/public-api/src/modules/client-join/client-join.controller.ts",
    "POST /client-join-intents",
    "Direct-link relationship creation is a core client invariant."
  ),
  exclusion(
    "exclude.media.profile_avatar.upload-intent",
    "astrologer-api.MediaModule",
    "apps/astrologer-api/src/modules/media/media.controller.ts",
    "POST /media/upload-intents [purpose=profile_avatar]",
    "Profile and verification media are baseline account/compliance infrastructure."
  ),
  exclusion(
    "exclude.media.profile_avatar.complete",
    "astrologer-api.MediaModule",
    "apps/astrologer-api/src/modules/media/media.controller.ts",
    "POST /media/:mediaId/complete [persisted purpose=profile_avatar]",
    "Profile and verification media completion follows the persisted never-gated purpose."
  ),
  exclusion(
    "exclude.media.profile_cover.upload-intent",
    "astrologer-api.MediaModule",
    "apps/astrologer-api/src/modules/media/media.controller.ts",
    "POST /media/upload-intents [purpose=profile_cover]",
    "Profile and verification media are baseline account/compliance infrastructure."
  ),
  exclusion(
    "exclude.media.profile_cover.complete",
    "astrologer-api.MediaModule",
    "apps/astrologer-api/src/modules/media/media.controller.ts",
    "POST /media/:mediaId/complete [persisted purpose=profile_cover]",
    "Profile and verification media completion follows the persisted never-gated purpose."
  ),
  exclusion(
    "exclude.media.verification_identity_document.upload-intent",
    "astrologer-api.MediaModule",
    "apps/astrologer-api/src/modules/media/media.controller.ts",
    "POST /media/upload-intents [purpose=verification_identity_document]",
    "Profile and verification media are baseline account/compliance infrastructure."
  ),
  exclusion(
    "exclude.media.verification_identity_document.complete",
    "astrologer-api.MediaModule",
    "apps/astrologer-api/src/modules/media/media.controller.ts",
    "POST /media/:mediaId/complete [persisted purpose=verification_identity_document]",
    "Profile and verification media completion follows the persisted never-gated purpose."
  ),
  exclusion(
    "exclude.media.verification_qualification_document.upload-intent",
    "astrologer-api.MediaModule",
    "apps/astrologer-api/src/modules/media/media.controller.ts",
    "POST /media/upload-intents [purpose=verification_qualification_document]",
    "Profile and verification media are baseline account/compliance infrastructure."
  ),
  exclusion(
    "exclude.media.verification_qualification_document.complete",
    "astrologer-api.MediaModule",
    "apps/astrologer-api/src/modules/media/media.controller.ts",
    "POST /media/:mediaId/complete [persisted purpose=verification_qualification_document]",
    "Profile and verification media completion follows the persisted never-gated purpose."
  )
] as const;

const expectedBoundaryExclusions = [] as const;

const expectedContinuationExclusions = [
  {
    id: "exclude.payment.webhook.continuation",
    surface: {
      id: "exclude.payment.webhook.continuation.surface",
      ownerModule: "payment-worker.webhook-server",
      sourcePath: "apps/payment-worker/src/webhooks/payment-webhook.server.ts",
      identifier: "POST /webhooks/arc-pay"
    },
    processor: {
      ownerModule: "payment-worker.payment-webhook",
      sourcePath: "apps/payment-worker/src/webhooks/payment-webhook.processor.ts",
      identifier: "createPaymentWebhookProcessor#process"
    },
    commands: [
      {
        ownerModule: "payment-worker.arc-pay-payment-reader",
        sourcePath: "apps/payment-worker/src/arc-pay/arc-pay-payment-reader.ts",
        identifier: "createArcPayPaymentAttemptResolver#resolvePaymentAttemptId"
      },
      {
        ownerModule: "domain.payments",
        sourcePath: "packages/domain/src/payments/payment-use-cases.ts",
        identifier: "ingestPaymentProviderWebhook"
      },
      {
        ownerModule: "domain.wallet",
        sourcePath: "packages/domain/src/wallet/ledger-use-cases.ts",
        identifier: "capturePaymentProviderWebhook"
      },
      {
        ownerModule: "domain.payments",
        sourcePath: "packages/domain/src/payments/payment-use-cases.ts",
        identifier: "releaseTerminalPaymentProviderWebhook"
      },
      {
        ownerModule: "domain.wallet",
        sourcePath: "packages/domain/src/wallet/ledger-use-cases.ts",
        identifier: "recordPaymentReversalProviderWebhook"
      },
      {
        ownerModule: "domain.reconciliation",
        sourcePath: "packages/domain/src/reconciliation/reconciliation-use-cases.ts",
        identifier: "recordProviderSettlementMatch"
      },
      {
        ownerModule: "domain.reconciliation",
        sourcePath: "packages/domain/src/reconciliation/reconciliation-use-cases.ts",
        identifier: "recordProviderReconciliationException"
      }
    ],
    policy: "never_tariff_gate",
    reason:
      "A verified provider callback must complete financial state transitions for an already-created payment independently of current tariff state."
  },
  {
    id: "exclude.payment.settlement-reconciliation.continuation",
    surface: {
      id: "exclude.payment.settlement-reconciliation.continuation.surface",
      ownerModule: "payment-worker.settlement-reconciliation",
      sourcePath: "apps/payment-worker/src/reconciliation/settlement-ledger.processor.ts",
      identifier: "startSettlementLedgerReconciliationInterval"
    },
    processor: {
      ownerModule: "payment-worker.settlement-reconciliation",
      sourcePath: "apps/payment-worker/src/reconciliation/settlement-ledger.processor.ts",
      identifier: "createSettlementLedgerReconciliationProcessor#tick"
    },
    commands: [
      {
        ownerModule: "payment-worker.arc-pay-settlement-ledger",
        sourcePath: "apps/payment-worker/src/arc-pay/arc-pay-settlement-ledger-client.ts",
        identifier: "createArcPaySettlementLedgerClient#listSettlementLedger"
      },
      {
        ownerModule: "domain.reconciliation",
        sourcePath: "packages/domain/src/reconciliation/reconciliation-use-cases.ts",
        identifier: "reconcileProviderSettlementLedgerBatch"
      }
    ],
    policy: "never_tariff_gate",
    reason:
      "Provider settlement reconciliation is financial-integrity work for accepted payments and cannot depend on current tariff state."
  },
  {
    id: "exclude.payment.hold-release.continuation",
    surface: {
      id: "exclude.payment.hold-release.continuation.surface",
      ownerModule: "payment-worker.hold-release",
      sourcePath: "apps/payment-worker/src/holds/hold-release.processor.ts",
      identifier: "startHoldReleaseInterval"
    },
    processor: {
      ownerModule: "payment-worker.hold-release",
      sourcePath: "apps/payment-worker/src/holds/hold-release.processor.ts",
      identifier: "createHoldReleaseProcessor#tick"
    },
    commands: [
      {
        ownerModule: "domain.wallet",
        sourcePath: "packages/domain/src/wallet/ledger-use-cases.ts",
        identifier: "releaseDueCapturedSaleHolds"
      }
    ],
    policy: "never_tariff_gate",
    reason:
      "Releasing due captured-sale holds is ledger continuation for accepted payments and cannot depend on current tariff state."
  }
] as const;

const expectedFeatureCodes = [
  "engine",
  "pdf",
  "natal",
  "synastry",
  "forecast",
  "solar",
  "matrix",
  "numerology",
  "hd",
  "horar",
  "vedic",
  "astrocal",
  "child",
  "page",
  "products",
  "calendar",
  "crm",
  "funnels",
  "group",
  "ai",
  "aicontent",
  "triggers",
  "content",
  "autopost",
  "journal",
  "video",
  "recordings",
  "inbox",
  "analytics",
  "refs",
  "team",
  "whitelabel",
  "api",
  "priority"
] as const;

const expectedClassifications = {
  live: [
    "engine",
    "natal",
    "synastry",
    "forecast",
    "solar",
    "matrix",
    "numerology",
    "hd",
    "horar",
    "astrocal",
    "products",
    "funnels",
    "refs"
  ],
  partial: ["pdf", "child", "calendar", "crm", "ai", "inbox"],
  absent: [
    "vedic",
    "page",
    "group",
    "aicontent",
    "triggers",
    "content",
    "autopost",
    "journal",
    "video",
    "recordings",
    "analytics",
    "team",
    "whitelabel",
    "api",
    "priority"
  ]
} as const;

const expectedRequiredCapabilities = {
  engine: [],
  pdf: [],
  natal: ["engine"],
  synastry: ["engine"],
  forecast: ["engine"],
  solar: ["engine"],
  matrix: [],
  numerology: [],
  hd: [],
  horar: ["engine"],
  vedic: [],
  astrocal: ["engine"],
  child: ["natal"],
  page: [],
  products: [],
  calendar: [],
  crm: [],
  funnels: [],
  group: [],
  ai: [],
  aicontent: [],
  triggers: [],
  content: [],
  autopost: [],
  journal: [],
  video: [],
  recordings: [],
  inbox: [],
  analytics: [],
  refs: [],
  team: [],
  whitelabel: [],
  api: [],
  priority: []
} as const;

const calculationSharedRefs = [
  "calculations.resource.list",
  "calculations.resource.read",
  "calculations.resource.link-client",
  "calculations.resource.publish",
  "calculations.resource.interpretation.create",
  "calculations.resource.interpretation.approve",
  "calculations.resource.archive"
] as const;

const expectedSharedRefsByFeature = {
  engine: calculationSharedRefs,
  natal: calculationSharedRefs,
  synastry: calculationSharedRefs,
  forecast: calculationSharedRefs,
  solar: calculationSharedRefs,
  matrix: calculationSharedRefs,
  numerology: calculationSharedRefs,
  hd: calculationSharedRefs,
  horar: calculationSharedRefs,
  products: ["media.upload-intent.create", "media.upload.complete"]
} as const;

const expectedUnresolvedRefsByFeature = {
  engine: [
    "chart.astrocartography.create",
    "chart.composite.create",
    "calculations.list-all.entitlement-projection"
  ],
  natal: ["chart.child-purpose", "calculations.list-all.entitlement-projection"],
  synastry: ["calculations.list-all.entitlement-projection"],
  forecast: ["calculations.list-all.entitlement-projection"],
  solar: ["calculations.list-all.entitlement-projection"],
  matrix: ["calculations.list-all.entitlement-projection"],
  numerology: ["calculations.list-all.entitlement-projection"],
  hd: ["calculations.list-all.entitlement-projection"],
  horar: ["calculations.list-all.entitlement-projection"],
  child: ["chart.child-purpose"],
  inbox: ["inbox.paid-obligation-allow-rule"]
} as const;

const expectedImplementedOwners = {
  engine: {
    kind: "implemented",
    module: "astrologer-api.CalculationsModule",
    sourcePath: "apps/astrologer-api/src/modules/calculations/calculations.controller.ts"
  },
  pdf: {
    kind: "implemented",
    module: "workers.calculation-pdf",
    sourcePath: "apps/workers/src/calculation-pdf/calculation-pdf.queue.ts"
  },
  natal: {
    kind: "implemented",
    module: "astrologer-api.ChartsModule",
    sourcePath: "apps/astrologer-api/src/modules/charts/charts.controller.ts"
  },
  synastry: {
    kind: "implemented",
    module: "astrologer-api.ChartsModule",
    sourcePath: "apps/astrologer-api/src/modules/charts/charts.controller.ts"
  },
  forecast: {
    kind: "implemented",
    module: "astrologer-api.ChartsModule",
    sourcePath: "apps/astrologer-api/src/modules/charts/charts.controller.ts"
  },
  solar: {
    kind: "implemented",
    module: "astrologer-api.ChartsModule",
    sourcePath: "apps/astrologer-api/src/modules/charts/charts.controller.ts"
  },
  matrix: {
    kind: "implemented",
    module: "astrologer-api.MatrixModule",
    sourcePath: "apps/astrologer-api/src/modules/matrix/matrix.controller.ts"
  },
  numerology: {
    kind: "implemented",
    module: "astrologer-api.NumerologyModule",
    sourcePath: "apps/astrologer-api/src/modules/numerology/numerology.controller.ts"
  },
  hd: {
    kind: "implemented",
    module: "astrologer-api.HumanDesignModule",
    sourcePath: "apps/astrologer-api/src/modules/human-design/human-design.controller.ts"
  },
  horar: {
    kind: "implemented",
    module: "astrologer-api.ChartsModule",
    sourcePath: "apps/astrologer-api/src/modules/charts/charts.controller.ts"
  },
  astrocal: {
    kind: "implemented",
    module: "astrologer-api.AstroCalendarModule",
    sourcePath: "apps/astrologer-api/src/modules/astro-calendar/astro-calendar.controller.ts"
  },
  child: {
    kind: "implemented",
    module: "astrologer-api.ChartsModule",
    sourcePath: "apps/astrologer-api/src/modules/charts/charts.controller.ts"
  },
  products: {
    kind: "implemented",
    module: "astrologer-api.ProductsModule",
    sourcePath: "apps/astrologer-api/src/modules/products/products.controller.ts"
  },
  calendar: {
    kind: "implemented",
    module: "astrologer-api.CalendarModule",
    sourcePath: "apps/astrologer-api/src/modules/calendar/calendar.controller.ts"
  },
  crm: {
    kind: "implemented",
    module: "astrologer-api.ClientsModule",
    sourcePath: "apps/astrologer-api/src/modules/clients/clients.controller.ts"
  },
  funnels: {
    kind: "implemented",
    module: "astrologer-api.FlowsModule",
    sourcePath: "apps/astrologer-api/src/modules/flows/flows.controller.ts"
  },
  ai: { kind: "implemented", module: "packages.ai", sourcePath: "packages/ai/src/index.ts" },
  inbox: {
    kind: "implemented",
    module: "astrologer-api.MessagingModule",
    sourcePath: "apps/astrologer-api/src/modules/messaging/messaging.controller.ts"
  },
  refs: {
    kind: "implemented",
    module: "astrologer-api.DictionaryModule",
    sourcePath: "apps/astrologer-api/src/modules/dictionary/dictionary.controller.ts"
  }
} as const;

const expectedCounterCodes = {
  calendar: ["bookings"],
  funnels: ["automations"],
  ai: ["ai_requests"],
  team: ["seats"]
} as const;

const controllerTargets = [
  ["apps/astrologer-api/src/modules/charts/charts.controller.ts", "ChartsController"],
  ["apps/astrologer-api/src/modules/charts/charts-pdf.controller.ts", "ChartsPdfController"],
  [
    "apps/astrologer-api/src/modules/calculations/calculations.controller.ts",
    "CalculationsController"
  ],
  ["apps/astrologer-api/src/modules/matrix/matrix.controller.ts", "MatrixController"],
  ["apps/astrologer-api/src/modules/matrix/matrix-notes.controller.ts", "MatrixNotesController"],
  ["apps/astrologer-api/src/modules/matrix/matrix-report.controller.ts", "MatrixReportController"],
  ["apps/astrologer-api/src/modules/matrix/matrix-pdf.controller.ts", "MatrixPdfController"],
  ["apps/astrologer-api/src/modules/numerology/numerology.controller.ts", "NumerologyController"],
  [
    "apps/astrologer-api/src/modules/numerology/numerology-pdf.controller.ts",
    "NumerologyPdfController"
  ],
  [
    "apps/astrologer-api/src/modules/human-design/human-design.controller.ts",
    "HumanDesignController"
  ],
  [
    "apps/astrologer-api/src/modules/human-design/human-design-pdf.controller.ts",
    "HumanDesignPdfController"
  ],
  [
    "apps/astrologer-api/src/modules/astro-calendar/astro-calendar.controller.ts",
    "AstroCalendarController"
  ],
  ["apps/astrologer-api/src/modules/products/products.controller.ts", "ProductsController"],
  ["apps/astrologer-api/src/modules/calendar/calendar.controller.ts", "CalendarController"],
  [
    "apps/astrologer-api/src/modules/availability/availability.controller.ts",
    "AvailabilityController"
  ],
  ["apps/astrologer-api/src/modules/bookings/bookings.controller.ts", "BookingsController"],
  ["apps/astrologer-api/src/modules/flows/flows.controller.ts", "FlowTemplatesController"],
  ["apps/astrologer-api/src/modules/flows/flows.controller.ts", "FlowsController"],
  [
    "apps/astrologer-api/src/modules/flows/flow-enrollment.controller.ts",
    "FlowEnrollmentController"
  ],
  [
    "apps/astrologer-api/src/modules/flows/flow-activation-review.controller.ts",
    "FlowActivationReviewController"
  ],
  ["apps/astrologer-api/src/modules/flows/flow-runs.controller.ts", "FlowRunsController"],
  ["apps/astrologer-api/src/modules/flows/flow-approvals.controller.ts", "FlowApprovalsController"],
  ["apps/astrologer-api/src/modules/messaging/messaging.controller.ts", "MessagingController"],
  [
    "apps/astrologer-api/src/modules/messaging/messaging-events.controller.ts",
    "MessagingEventsController"
  ],
  [
    "apps/astrologer-api/src/modules/messaging/instagram-graph-oauth.controller.ts",
    "InstagramGraphOAuthController"
  ],
  [
    "apps/astrologer-api/src/modules/messaging/messaging-webhooks.controller.ts",
    "MessagingWebhooksController"
  ],
  ["apps/astrologer-api/src/modules/dictionary/dictionary.controller.ts", "DictionaryController"],
  [
    "apps/astrologer-api/src/modules/dictionary-ai/dictionary-ai.controller.ts",
    "DictionaryAiController"
  ],
  ["apps/astrologer-api/src/modules/media/media.controller.ts", "MediaController"],
  ["apps/astrologer-api/src/modules/clients/clients.controller.ts", "ClientsController"],
  ["apps/astrologer-api/src/modules/finance/finance.controller.ts", "FinanceController"],
  [
    "apps/astrologer-api/src/modules/platform-tariffs/platform-tariffs.controller.ts",
    "AstrologerTariffsController"
  ],
  [
    "apps/astrologer-api/src/modules/astrologer-profile/astrologer-profile.controller.ts",
    "AstrologerProfileController"
  ],
  [
    "apps/astrologer-api/src/modules/verification/verification.controller.ts",
    "VerificationController"
  ],
  [
    "apps/astrologer-api/src/modules/identity/passwordless/identity-passwordless.controller.ts",
    "IdentityPasswordlessController"
  ],
  [
    "apps/astrologer-api/src/modules/identity/registration/identity-registration.controller.ts",
    "IdentityRegistrationController"
  ],
  [
    "apps/astrologer-api/src/modules/identity/session/identity-current-account.controller.ts",
    "IdentityCurrentAccountController"
  ],
  [
    "apps/astrologer-api/src/modules/identity/session/identity-session.controller.ts",
    "IdentitySessionController"
  ],
  ["apps/astrologer-api/src/modules/health/health.controller.ts", "HealthController"],
  ["apps/public-api/src/modules/orders/orders.controller.ts", "OrdersController"],
  [
    "apps/public-api/src/modules/client-commerce/client-commerce.controller.ts",
    "ClientCommerceController"
  ],
  ["apps/public-api/src/modules/booking/booking.controller.ts", "BookingController"],
  ["apps/public-api/src/modules/payments/payments.controller.ts", "PaymentsController"],
  [
    "apps/public-api/src/modules/client-profile/client-profile.controller.ts",
    "ClientProfileController"
  ],
  ["apps/public-api/src/modules/client-join/client-join.controller.ts", "ClientJoinController"],
  [
    "apps/public-api/src/modules/identity/passwordless/identity-passwordless.controller.ts",
    "IdentityPasswordlessController"
  ],
  [
    "apps/public-api/src/modules/identity/registration/identity-registration.controller.ts",
    "IdentityRegistrationController"
  ],
  [
    "apps/public-api/src/modules/identity/session/identity-current-account.controller.ts",
    "IdentityCurrentAccountController"
  ],
  [
    "apps/public-api/src/modules/identity/session/identity-session.controller.ts",
    "IdentitySessionController"
  ],
  ["apps/public-api/src/modules/health/health.controller.ts", "HealthController"]
] as const;

export {
  controllerTargets,
  expectedAuditedSurfaces,
  expectedBoundaryExclusions,
  expectedClassifications,
  expectedContinuationExclusions,
  expectedCounterCodes,
  expectedFeatureCodes,
  expectedImplementedOwners,
  expectedRequiredCapabilities,
  expectedSharedRefsByFeature,
  expectedSharedSurfaces,
  expectedSurfaceExclusions,
  expectedUnresolvedCapabilitySurfaces,
  expectedUnresolvedRefsByFeature
};
export type { AuditedSurface };
