export const expectedPlatformCapabilityOperationContracts = {
  "engine.chart-job.read": {
    semanticKind: "read",
    requirement: {
      kind: "resource_capability",
      selector: "persisted ChartJobForProcessing.method loaded by jobId",
      capabilityMap: {
        natal: ["engine", "natal"],
        synastry: ["engine", "synastry"],
        transit: ["engine", "forecast"],
        progression: ["engine", "forecast"],
        solar_return: ["engine", "solar"],
        horary: ["engine", "horar"]
      },
      unresolvedValues: ["astrocartography", "composite"],
      exemptValues: [],
      unknownValuePolicy: "deny",
      collectionMode: "not_applicable"
    }
  },
  "engine.chart-result.read": {
    semanticKind: "read",
    requirement: {
      kind: "resource_capability",
      selector: "persisted CalculationRecord.module + CalculationRecord.methodCode",
      capabilityMap: {
        "chart:natal": ["engine", "natal"],
        "chart:synastry": ["engine", "synastry"],
        "chart:transit": ["engine", "forecast"],
        "chart:progression": ["engine", "forecast"],
        "chart:solar_return": ["engine", "solar"],
        "chart:horary": ["engine", "horar"],
        "matrix:ladini_22": ["matrix"],
        "numerology:pythagorean": ["numerology"],
        "human_design:human_design_classic": ["hd"]
      },
      unresolvedValues: ["chart:astrocartography", "chart:composite"],
      exemptValues: [],
      unknownValuePolicy: "deny",
      collectionMode: "not_applicable"
    }
  },
  "engine.dictionary.by-codes.read": {
    semanticKind: "read",
    requirement: { kind: "all_of", capabilities: ["engine"] }
  },
  "engine.chart.recalculate": {
    semanticKind: "generation",
    requirement: {
      kind: "resource_capability",
      selector: "persisted CalculationRecord.module + CalculationRecord.methodCode",
      capabilityMap: {
        "chart:natal": ["engine", "natal"],
        "chart:synastry": ["engine", "synastry"],
        "chart:transit": ["engine", "forecast"],
        "chart:progression": ["engine", "forecast"],
        "chart:solar_return": ["engine", "solar"],
        "chart:horary": ["engine", "horar"],
        "matrix:ladini_22": ["matrix"],
        "numerology:pythagorean": ["numerology"],
        "human_design:human_design_classic": ["hd"]
      },
      unresolvedValues: ["chart:astrocartography", "chart:composite"],
      exemptValues: [],
      unknownValuePolicy: "deny",
      collectionMode: "not_applicable"
    }
  },
  "engine.chart.execute": {
    semanticKind: "worker",
    requirement: {
      kind: "resource_capability",
      selector: "persisted ChartJobForProcessing.method loaded by jobId",
      capabilityMap: {
        natal: ["engine", "natal"],
        synastry: ["engine", "synastry"],
        transit: ["engine", "forecast"],
        progression: ["engine", "forecast"],
        solar_return: ["engine", "solar"],
        horary: ["engine", "horar"]
      },
      unresolvedValues: ["astrocartography", "composite"],
      exemptValues: [],
      unknownValuePolicy: "deny",
      collectionMode: "not_applicable"
    },
    processor: {
      sourcePath: "apps/chart-worker/src/chart-jobs.processor.ts",
      identifier: "processChartCalculationJob"
    },
    entitlementSubjectAuthority: {
      persistedOwnerSelector: "persisted ChartJobForProcessing.ownerUserId loaded by jobId",
      queuePayloadPolicy: "untrusted_reference_only",
      availability: "unwired",
      publicationBlocker: true
    }
  },
  "pdf.chart.latest": {
    semanticKind: "read",
    requirement: {
      kind: "shared_with_fixed_owner",
      sharedCapability: "pdf",
      ownerCapability: "natal"
    }
  },
  "pdf.chart.download": {
    semanticKind: "read",
    requirement: {
      kind: "shared_with_fixed_owner",
      sharedCapability: "pdf",
      ownerCapability: "natal"
    }
  },
  "pdf.matrix.latest": {
    semanticKind: "read",
    requirement: {
      kind: "shared_with_fixed_owner",
      sharedCapability: "pdf",
      ownerCapability: "matrix"
    }
  },
  "pdf.matrix.download": {
    semanticKind: "read",
    requirement: {
      kind: "shared_with_fixed_owner",
      sharedCapability: "pdf",
      ownerCapability: "matrix"
    }
  },
  "pdf.numerology.latest": {
    semanticKind: "read",
    requirement: {
      kind: "shared_with_fixed_owner",
      sharedCapability: "pdf",
      ownerCapability: "numerology"
    }
  },
  "pdf.numerology.download": {
    semanticKind: "read",
    requirement: {
      kind: "shared_with_fixed_owner",
      sharedCapability: "pdf",
      ownerCapability: "numerology"
    }
  },
  "pdf.hd.latest": {
    semanticKind: "read",
    requirement: { kind: "shared_with_fixed_owner", sharedCapability: "pdf", ownerCapability: "hd" }
  },
  "pdf.hd.download": {
    semanticKind: "read",
    requirement: { kind: "shared_with_fixed_owner", sharedCapability: "pdf", ownerCapability: "hd" }
  },
  "pdf.chart.enqueue": {
    semanticKind: "generation",
    requirement: {
      kind: "shared_with_fixed_owner",
      sharedCapability: "pdf",
      ownerCapability: "natal"
    }
  },
  "pdf.matrix.enqueue": {
    semanticKind: "generation",
    requirement: {
      kind: "shared_with_fixed_owner",
      sharedCapability: "pdf",
      ownerCapability: "matrix"
    }
  },
  "pdf.numerology.enqueue": {
    semanticKind: "generation",
    requirement: {
      kind: "shared_with_fixed_owner",
      sharedCapability: "pdf",
      ownerCapability: "numerology"
    }
  },
  "pdf.hd.enqueue": {
    semanticKind: "generation",
    requirement: { kind: "shared_with_fixed_owner", sharedCapability: "pdf", ownerCapability: "hd" }
  },
  "pdf.render": {
    semanticKind: "worker",
    requirement: {
      kind: "shared_with_resource_owner",
      sharedCapability: "pdf",
      selector: "persisted CalculationPdfJob.module + CalculationPdfJob.methodCode",
      capabilityMap: {
        "chart:natal": ["natal"],
        "matrix:ladini_22": ["matrix"],
        "numerology:pythagorean": ["numerology"],
        "human_design:human_design_classic": ["hd"]
      },
      unresolvedValues: [],
      unknownValuePolicy: "deny"
    },
    processor: {
      sourcePath: "apps/workers/src/calculation-pdf/calculation-pdf.processor.ts",
      identifier: "processCalculationPdfJob"
    },
    entitlementSubjectAuthority: {
      persistedOwnerSelector: "persisted CalculationPdfJob.ownerUserId loaded by jobId",
      queuePayloadPolicy: "untrusted_reference_only",
      availability: "unwired",
      publicationBlocker: true
    }
  },
  "natal.job.create": {
    semanticKind: "generation",
    requirement: { kind: "all_of", capabilities: ["engine", "natal"] }
  },
  "synastry.job.create": {
    semanticKind: "generation",
    requirement: { kind: "all_of", capabilities: ["engine", "synastry"] }
  },
  "forecast.transit.create": {
    semanticKind: "generation",
    requirement: { kind: "all_of", capabilities: ["engine", "forecast"] }
  },
  "forecast.progression.create": {
    semanticKind: "generation",
    requirement: { kind: "all_of", capabilities: ["engine", "forecast"] }
  },
  "solar.return.create": {
    semanticKind: "generation",
    requirement: { kind: "all_of", capabilities: ["engine", "solar"] }
  },
  "matrix.notes.list": {
    semanticKind: "read",
    requirement: { kind: "all_of", capabilities: ["matrix"] }
  },
  "matrix.interpretations.read": {
    semanticKind: "read",
    requirement: { kind: "all_of", capabilities: ["matrix"] }
  },
  "matrix.report.read": {
    semanticKind: "read",
    requirement: { kind: "all_of", capabilities: ["matrix"] }
  },
  "matrix.preview": {
    semanticKind: "generation",
    requirement: { kind: "all_of", capabilities: ["matrix"] }
  },
  "matrix.calculation.create": {
    semanticKind: "generation",
    requirement: { kind: "all_of", capabilities: ["matrix"] }
  },
  "matrix.calculation.recalculate": {
    semanticKind: "generation",
    requirement: { kind: "all_of", capabilities: ["matrix"] }
  },
  "matrix.projection.generate": {
    semanticKind: "generation",
    requirement: { kind: "all_of", capabilities: ["matrix"] }
  },
  "matrix.note.create": {
    semanticKind: "mutation",
    requirement: { kind: "all_of", capabilities: ["matrix"] }
  },
  "matrix.note.update": {
    semanticKind: "mutation",
    requirement: { kind: "all_of", capabilities: ["matrix"] }
  },
  "matrix.note.delete": {
    semanticKind: "mutation",
    requirement: { kind: "all_of", capabilities: ["matrix"] }
  },
  "matrix.report.save": {
    semanticKind: "mutation",
    requirement: { kind: "all_of", capabilities: ["matrix"] }
  },
  "numerology.preview": {
    semanticKind: "generation",
    requirement: { kind: "all_of", capabilities: ["numerology"] }
  },
  "numerology.calculation.create": {
    semanticKind: "generation",
    requirement: { kind: "all_of", capabilities: ["numerology"] }
  },
  "numerology.calculation.recalculate": {
    semanticKind: "generation",
    requirement: { kind: "all_of", capabilities: ["numerology"] }
  },
  "hd.preview": {
    semanticKind: "generation",
    requirement: { kind: "all_of", capabilities: ["hd"] }
  },
  "hd.calculation.create": {
    semanticKind: "generation",
    requirement: { kind: "all_of", capabilities: ["hd"] }
  },
  "hd.calculation.recalculate": {
    semanticKind: "generation",
    requirement: { kind: "all_of", capabilities: ["hd"] }
  },
  "hd.transits.generate": {
    semanticKind: "generation",
    requirement: { kind: "all_of", capabilities: ["hd"] }
  },
  "horar.job.create": {
    semanticKind: "generation",
    requirement: { kind: "all_of", capabilities: ["engine", "horar"] }
  },
  "astrocal.range.read": {
    semanticKind: "read",
    requirement: { kind: "all_of", capabilities: ["engine", "astrocal"] }
  },
  "astrocal.generation.create": {
    semanticKind: "generation",
    requirement: { kind: "all_of", capabilities: ["engine", "astrocal"] }
  },
  "astrocal.generation.retry": {
    semanticKind: "generation",
    requirement: { kind: "all_of", capabilities: ["engine", "astrocal"] }
  },
  "astrocal.generate": {
    semanticKind: "worker",
    requirement: { kind: "all_of", capabilities: ["engine", "astrocal"] },
    processor: {
      sourcePath: "apps/chart-worker/src/astro-calendar-jobs.processor.ts",
      identifier: "processAstroCalendarGenerationJob"
    },
    entitlementSubjectAuthority: {
      persistedOwnerSelector:
        "persisted AstroCalendarGeneration.ownerUserId loaded by generationId",
      queuePayloadPolicy: "untrusted_reference_only",
      availability: "unwired",
      publicationBlocker: true
    }
  },
  "products.list": {
    semanticKind: "read",
    requirement: { kind: "all_of", capabilities: ["products"] }
  },
  "products.summary": {
    semanticKind: "read",
    requirement: { kind: "all_of", capabilities: ["products"] }
  },
  "products.templates": {
    semanticKind: "read",
    requirement: { kind: "all_of", capabilities: ["products"] }
  },
  "products.read": {
    semanticKind: "read",
    requirement: { kind: "all_of", capabilities: ["products"] }
  },
  "products.public-purchase-options.read": {
    semanticKind: "read",
    requirement: {
      kind: "all_of",
      capabilities: ["products"],
      entitlementSubjectSelector:
        "persisted Product.ownerUserId resolved server-side after the explicit client-astrologer relationship",
      unknownSubjectPolicy: "deny"
    }
  },
  "products.public-available-slots.read": {
    semanticKind: "read",
    requirement: {
      kind: "all_of",
      capabilities: ["products"],
      entitlementSubjectSelector:
        "persisted live Product.ownerUserId resolved server-side after the explicit client-astrologer relationship",
      unknownSubjectPolicy: "deny"
    }
  },
  "products.template-draft.create": {
    semanticKind: "mutation",
    requirement: { kind: "all_of", capabilities: ["products"] }
  },
  "products.create": {
    semanticKind: "mutation",
    requirement: { kind: "all_of", capabilities: ["products"] }
  },
  "products.update": {
    semanticKind: "mutation",
    requirement: { kind: "all_of", capabilities: ["products"] }
  },
  "products.publish": {
    semanticKind: "mutation",
    requirement: { kind: "all_of", capabilities: ["products"] }
  },
  "products.move-to-draft": {
    semanticKind: "mutation",
    requirement: { kind: "all_of", capabilities: ["products"] }
  },
  "products.archive": {
    semanticKind: "mutation",
    requirement: { kind: "all_of", capabilities: ["products"] }
  },
  "products.duplicate": {
    semanticKind: "mutation",
    requirement: { kind: "all_of", capabilities: ["products"] }
  },
  "products.public-order.create": {
    semanticKind: "mutation",
    requirement: {
      kind: "all_of",
      capabilities: ["products"],
      entitlementSubjectSelector:
        "persisted Product.ownerUserId resolved server-side; client input cannot select entitlement subject",
      unknownSubjectPolicy: "deny"
    }
  },
  "calendar.range.read": {
    semanticKind: "read",
    requirement: { kind: "all_of", capabilities: ["calendar"] }
  },
  "calendar.availability.read": {
    semanticKind: "read",
    requirement: { kind: "all_of", capabilities: ["calendar"] }
  },
  "calendar.booking-slots.read": {
    semanticKind: "read",
    requirement: { kind: "all_of", capabilities: ["calendar"] }
  },
  "calendar.booking.read": {
    semanticKind: "read",
    requirement: {
      kind: "capability_or_historical_obligation",
      capabilities: ["calendar"],
      ownerSelector: "persisted Booking.ownerUserId",
      historicalEvidenceSelector:
        "persisted booking/order entitlement snapshot permits historical fulfillment",
      collectionMode: "not_applicable",
      unknownValuePolicy: "deny"
    }
  },
  "calendar.block.create": {
    semanticKind: "mutation",
    requirement: { kind: "all_of", capabilities: ["calendar"] }
  },
  "calendar.block.delete": {
    semanticKind: "mutation",
    requirement: { kind: "all_of", capabilities: ["calendar"] }
  },
  "calendar.availability.update": {
    semanticKind: "mutation",
    requirement: { kind: "all_of", capabilities: ["calendar"] }
  },
  "calendar.manual-booking.create": {
    semanticKind: "mutation",
    requirement: { kind: "all_of", capabilities: ["calendar"] }
  },
  "calendar.public-booking-intent.create": {
    semanticKind: "mutation",
    requirement: {
      kind: "all_of",
      capabilities: ["calendar", "products"],
      entitlementSubjectSelector:
        "persisted Product.ownerUserId resolved server-side before booking hold; client input cannot select entitlement subject",
      unknownSubjectPolicy: "deny"
    }
  },
  "funnels.templates.read": {
    semanticKind: "read",
    requirement: { kind: "all_of", capabilities: ["funnels"] }
  },
  "funnels.list": {
    semanticKind: "read",
    requirement: { kind: "all_of", capabilities: ["funnels"] }
  },
  "funnels.read": {
    semanticKind: "read",
    requirement: { kind: "all_of", capabilities: ["funnels"] }
  },
  "funnels.enrollment.read": {
    semanticKind: "read",
    requirement: {
      kind: "capability_or_historical_obligation",
      capabilities: ["funnels"],
      ownerSelector: "persisted flow enrollment owner",
      historicalEvidenceSelector: "current enrollment belongs to a previously entitled flow",
      collectionMode: "not_applicable",
      unknownValuePolicy: "deny"
    }
  },
  "funnels.activation-review": {
    semanticKind: "read",
    requirement: {
      kind: "capability_or_historical_obligation",
      capabilities: ["funnels"],
      ownerSelector: "persisted flow.ownerUserId",
      historicalEvidenceSelector: "target flow version was published before entitlement expiry",
      collectionMode: "not_applicable",
      unknownValuePolicy: "deny"
    }
  },
  "funnels.runs.list": {
    semanticKind: "read",
    requirement: {
      kind: "capability_or_historical_obligation",
      capabilities: ["funnels"],
      ownerSelector: "persisted flow.ownerUserId",
      historicalEvidenceSelector: "persisted flow run created before entitlement expiry",
      collectionMode: "filter_each_resource",
      unknownValuePolicy: "deny"
    }
  },
  "funnels.run.read": {
    semanticKind: "read",
    requirement: {
      kind: "capability_or_historical_obligation",
      capabilities: ["funnels"],
      ownerSelector: "persisted flow run owner",
      historicalEvidenceSelector: "persisted flow run created before entitlement expiry",
      collectionMode: "not_applicable",
      unknownValuePolicy: "deny"
    }
  },
  "funnels.approvals.list": {
    semanticKind: "read",
    requirement: {
      kind: "capability_or_historical_obligation",
      capabilities: ["funnels"],
      ownerSelector: "persisted approval owner",
      historicalEvidenceSelector: "pending approval belongs to an accepted flow run",
      collectionMode: "filter_each_resource",
      unknownValuePolicy: "deny"
    }
  },
  "funnels.work-items.list": {
    semanticKind: "read",
    requirement: {
      kind: "capability_or_historical_obligation",
      capabilities: ["funnels"],
      ownerSelector: "persisted work item owner",
      historicalEvidenceSelector: "work item belongs to an accepted flow run",
      collectionMode: "filter_each_resource",
      unknownValuePolicy: "deny"
    }
  },
  "funnels.create": {
    semanticKind: "mutation",
    requirement: { kind: "all_of", capabilities: ["funnels"] }
  },
  "funnels.validate": {
    semanticKind: "mutation",
    requirement: { kind: "all_of", capabilities: ["funnels"] }
  },
  "funnels.draft.update": {
    semanticKind: "mutation",
    requirement: { kind: "all_of", capabilities: ["funnels"] }
  },
  "funnels.publish": {
    semanticKind: "mutation",
    requirement: { kind: "all_of", capabilities: ["funnels"] }
  },
  "funnels.next-draft.create": {
    semanticKind: "mutation",
    requirement: { kind: "all_of", capabilities: ["funnels"] }
  },
  "funnels.archive": {
    semanticKind: "mutation",
    requirement: { kind: "all_of", capabilities: ["funnels"] }
  },
  "funnels.restore": {
    semanticKind: "mutation",
    requirement: { kind: "all_of", capabilities: ["funnels"] }
  },
  "funnels.duplicate": {
    semanticKind: "mutation",
    requirement: { kind: "all_of", capabilities: ["funnels"] }
  },
  "funnels.delete": {
    semanticKind: "mutation",
    requirement: { kind: "all_of", capabilities: ["funnels"] }
  },
  "funnels.activate": {
    semanticKind: "mutation",
    requirement: { kind: "all_of", capabilities: ["funnels"] }
  },
  "funnels.manual-client-run.create": {
    semanticKind: "mutation",
    requirement: { kind: "all_of", capabilities: ["funnels"] }
  },
  "funnels.pause": {
    semanticKind: "mutation",
    requirement: {
      kind: "capability_or_historical_obligation",
      capabilities: ["funnels"],
      ownerSelector: "persisted flow enrollment owner",
      historicalEvidenceSelector:
        "safety pause of an enrollment accepted before entitlement expiry",
      collectionMode: "not_applicable",
      unknownValuePolicy: "deny"
    }
  },
  "funnels.run.cancel": {
    semanticKind: "mutation",
    requirement: {
      kind: "capability_or_historical_obligation",
      capabilities: ["funnels"],
      ownerSelector: "persisted flow run owner",
      historicalEvidenceSelector: "safety cancellation of a run accepted before entitlement expiry",
      collectionMode: "not_applicable",
      unknownValuePolicy: "deny"
    }
  },
  "funnels.approval.decide": {
    semanticKind: "mutation",
    requirement: {
      kind: "capability_or_historical_obligation",
      capabilities: ["funnels"],
      ownerSelector: "persisted approval owner",
      historicalEvidenceSelector: "pending approval belongs to an accepted flow run",
      collectionMode: "not_applicable",
      unknownValuePolicy: "deny"
    }
  },
  "funnels.work-items.start": {
    semanticKind: "mutation",
    requirement: {
      kind: "capability_or_historical_obligation",
      capabilities: ["funnels"],
      ownerSelector: "persisted work item owner",
      historicalEvidenceSelector: "work item belongs to an accepted flow run",
      collectionMode: "not_applicable",
      unknownValuePolicy: "deny"
    }
  },
  "funnels.work-items.snooze": {
    semanticKind: "mutation",
    requirement: {
      kind: "capability_or_historical_obligation",
      capabilities: ["funnels"],
      ownerSelector: "persisted work item owner",
      historicalEvidenceSelector: "work item belongs to an accepted flow run",
      collectionMode: "not_applicable",
      unknownValuePolicy: "deny"
    }
  },
  "funnels.work-items.complete": {
    semanticKind: "mutation",
    requirement: {
      kind: "capability_or_historical_obligation",
      capabilities: ["funnels"],
      ownerSelector: "persisted work item owner",
      historicalEvidenceSelector: "work item belongs to an accepted flow run",
      collectionMode: "not_applicable",
      unknownValuePolicy: "deny"
    }
  },
  "funnels.booking-confirmed-enrollment-dispatch": {
    semanticKind: "worker",
    requirement: {
      kind: "capability_or_historical_obligation",
      capabilities: ["funnels"],
      ownerSelector: "persisted booking owner resolved from the claimed enrollment event",
      historicalEvidenceSelector:
        "accepted booking-confirmed enrollment event was committed before entitlement expiry",
      collectionMode: "not_applicable",
      unknownValuePolicy: "deny"
    },
    processor: {
      sourcePath: "apps/workers/src/flows/flow-runtime.outbox-relay.ts",
      identifier: "relayPendingFlowRuntimeDispatchEvents"
    },
    entitlementSubjectAuthority: {
      persistedOwnerSelector:
        "persisted Booking.ownerUserId resolved server-side from the claimed booking-confirmed enrollment event",
      queuePayloadPolicy: "untrusted_reference_only",
      availability: "ready",
      publicationBlocker: false
    }
  },
  "funnels.booking-lifecycle-dispatch": {
    semanticKind: "worker",
    requirement: {
      kind: "capability_or_historical_obligation",
      capabilities: ["funnels"],
      ownerSelector: "persisted booking owner resolved from the claimed lifecycle event",
      historicalEvidenceSelector:
        "accepted booking lifecycle event was committed before entitlement expiry",
      collectionMode: "not_applicable",
      unknownValuePolicy: "deny"
    },
    processor: {
      sourcePath: "apps/workers/src/flows/flow-runtime.outbox-relay.ts",
      identifier: "relayPendingFlowRuntimeDispatchEvents"
    },
    entitlementSubjectAuthority: {
      persistedOwnerSelector:
        "persisted BookingLifecycleEvent.ownerUserId resolved server-side from the claimed lifecycle event",
      queuePayloadPolicy: "untrusted_reference_only",
      availability: "ready",
      publicationBlocker: false
    }
  },
  "ai.chart.draft": {
    semanticKind: "generation",
    requirement: {
      kind: "shared_with_resource_owner",
      sharedCapability: "ai",
      selector: "persisted CalculationRecord.module + CalculationRecord.methodCode",
      capabilityMap: {
        "chart:natal": ["engine", "natal"],
        "chart:astrocartography": ["engine", "forecast"],
        "chart:synastry": ["engine", "synastry"],
        "chart:composite": ["engine", "synastry"],
        "chart:transit": ["engine", "forecast"],
        "chart:progression": ["engine", "forecast"],
        "chart:solar_return": ["engine", "solar"],
        "chart:horary": ["engine", "horar"]
      },
      unresolvedValues: [],
      unknownValuePolicy: "deny"
    }
  },
  "ai.matrix.draft": {
    semanticKind: "generation",
    requirement: {
      kind: "shared_with_fixed_owner",
      sharedCapability: "ai",
      ownerCapability: "matrix"
    }
  },
  "ai.numerology.draft": {
    semanticKind: "generation",
    requirement: {
      kind: "shared_with_fixed_owner",
      sharedCapability: "ai",
      ownerCapability: "numerology"
    }
  },
  "ai.hd.draft": {
    semanticKind: "generation",
    requirement: { kind: "shared_with_fixed_owner", sharedCapability: "ai", ownerCapability: "hd" }
  },
  "ai.refs.draft": {
    semanticKind: "generation",
    requirement: {
      kind: "shared_with_fixed_owner",
      sharedCapability: "ai",
      ownerCapability: "refs"
    }
  },
  "inbox.connections.list": {
    semanticKind: "read",
    requirement: { kind: "all_of", capabilities: ["inbox"] }
  },
  "inbox.threads.list": {
    semanticKind: "read",
    requirement: {
      kind: "capability_or_historical_obligation",
      capabilities: ["inbox"],
      ownerSelector: "authenticated astrologer owner",
      historicalEvidenceSelector: "persisted paid-obligation thread",
      collectionMode: "filter_each_resource",
      unknownValuePolicy: "deny"
    }
  },
  "inbox.thread.read": {
    semanticKind: "read",
    requirement: {
      kind: "capability_or_historical_obligation",
      capabilities: ["inbox"],
      ownerSelector: "persisted thread owner",
      historicalEvidenceSelector: "persisted paid-obligation thread",
      collectionMode: "not_applicable",
      unknownValuePolicy: "deny"
    }
  },
  "inbox.message-media.read": {
    semanticKind: "read",
    requirement: {
      kind: "capability_or_historical_obligation",
      capabilities: ["inbox"],
      ownerSelector: "persisted message thread owner",
      historicalEvidenceSelector: "persisted paid-obligation thread",
      collectionMode: "not_applicable",
      unknownValuePolicy: "deny"
    }
  },
  "inbox.events.stream": {
    semanticKind: "read",
    requirement: {
      kind: "capability_or_historical_obligation",
      capabilities: ["inbox"],
      ownerSelector: "authenticated astrologer owner",
      historicalEvidenceSelector:
        "stream filters accepted delivery and paid-obligation thread events",
      collectionMode: "filter_each_resource",
      unknownValuePolicy: "deny"
    }
  },
  "inbox.telegram-business.start": {
    semanticKind: "mutation",
    requirement: { kind: "all_of", capabilities: ["inbox"] }
  },
  "inbox.instagram-graph.start": {
    semanticKind: "mutation",
    requirement: { kind: "all_of", capabilities: ["inbox"] }
  },
  "inbox.telegram-mtproto.start": {
    semanticKind: "mutation",
    requirement: { kind: "all_of", capabilities: ["inbox"] }
  },
  "inbox.telegram-mtproto.code": {
    semanticKind: "mutation",
    requirement: { kind: "all_of", capabilities: ["inbox"] }
  },
  "inbox.telegram-mtproto.password": {
    semanticKind: "mutation",
    requirement: { kind: "all_of", capabilities: ["inbox"] }
  },
  "inbox.message.send": {
    semanticKind: "mutation",
    requirement: {
      kind: "capability_or_historical_obligation",
      capabilities: ["inbox"],
      ownerSelector: "persisted thread owner",
      historicalEvidenceSelector: "persisted paid-obligation thread",
      collectionMode: "not_applicable",
      unknownValuePolicy: "deny"
    }
  },
  "inbox.thread.link-client": {
    semanticKind: "mutation",
    requirement: {
      kind: "capability_or_historical_obligation",
      capabilities: ["inbox"],
      ownerSelector: "persisted thread owner",
      historicalEvidenceSelector: "persisted paid-obligation thread",
      collectionMode: "not_applicable",
      unknownValuePolicy: "deny"
    }
  },
  "inbox.thread.create-client": {
    semanticKind: "mutation",
    requirement: {
      kind: "capability_or_historical_obligation",
      capabilities: ["inbox"],
      ownerSelector: "persisted thread owner",
      historicalEvidenceSelector: "persisted paid-obligation thread",
      collectionMode: "not_applicable",
      unknownValuePolicy: "deny"
    }
  },
  "inbox.thread.mark-read": {
    semanticKind: "mutation",
    requirement: {
      kind: "capability_or_historical_obligation",
      capabilities: ["inbox"],
      ownerSelector: "persisted thread owner",
      historicalEvidenceSelector: "persisted paid-obligation thread",
      collectionMode: "not_applicable",
      unknownValuePolicy: "deny"
    }
  },
  "inbox.delivery": {
    semanticKind: "worker",
    requirement: {
      kind: "capability_or_historical_obligation",
      capabilities: ["inbox"],
      ownerSelector: "persisted messagingThreads.astrologerUserId loaded by outboxEventId",
      historicalEvidenceSelector: "accepted queued delivery or paid-obligation thread",
      collectionMode: "not_applicable",
      unknownValuePolicy: "deny"
    },
    processor: {
      sourcePath: "apps/notification-worker/src/messaging-delivery.processor.ts",
      identifier: "processMessagingDeliveryJob"
    },
    entitlementSubjectAuthority: {
      persistedOwnerSelector:
        "persisted messagingThreads.astrologerUserId loaded by outboxEventId; MessagingDeliveryWorkItem projection not yet wired",
      queuePayloadPolicy: "untrusted_reference_only",
      availability: "unwired",
      publicationBlocker: true
    }
  },
  "refs.categories.list": {
    semanticKind: "read",
    requirement: { kind: "all_of", capabilities: ["refs"] }
  },
  "refs.entries.list": {
    semanticKind: "read",
    requirement: { kind: "all_of", capabilities: ["refs"] }
  },
  "refs.custom-entry.create": {
    semanticKind: "mutation",
    requirement: { kind: "all_of", capabilities: ["refs"] }
  },
  "refs.custom-entry.update": {
    semanticKind: "mutation",
    requirement: { kind: "all_of", capabilities: ["refs"] }
  },
  "refs.platform-entry.override": {
    semanticKind: "mutation",
    requirement: { kind: "all_of", capabilities: ["refs"] }
  },
  "refs.entry.delete": {
    semanticKind: "mutation",
    requirement: { kind: "all_of", capabilities: ["refs"] }
  },
  "refs.entries.reset": {
    semanticKind: "mutation",
    requirement: { kind: "all_of", capabilities: ["refs"] }
  },
  "refs.platform-entry.override-delete": {
    semanticKind: "mutation",
    requirement: { kind: "all_of", capabilities: ["refs"] }
  },
  "calculations.resource.list": {
    semanticKind: "read",
    requirement: {
      kind: "resource_capability",
      selector: "each persisted CalculationRecord.module + CalculationRecord.methodCode",
      capabilityMap: {
        "chart:natal": ["engine", "natal"],
        "chart:synastry": ["engine", "synastry"],
        "chart:transit": ["engine", "forecast"],
        "chart:progression": ["engine", "forecast"],
        "chart:solar_return": ["engine", "solar"],
        "chart:horary": ["engine", "horar"],
        "matrix:ladini_22": ["matrix"],
        "numerology:pythagorean": ["numerology"],
        "human_design:human_design_classic": ["hd"]
      },
      unresolvedValues: ["chart:astrocartography", "chart:composite"],
      exemptValues: [],
      unknownValuePolicy: "deny",
      collectionMode: "filter_each_resource"
    }
  },
  "calculations.resource.read": {
    semanticKind: "read",
    requirement: {
      kind: "resource_capability",
      selector: "persisted CalculationRecord.module + CalculationRecord.methodCode",
      capabilityMap: {
        "chart:natal": ["engine", "natal"],
        "chart:synastry": ["engine", "synastry"],
        "chart:transit": ["engine", "forecast"],
        "chart:progression": ["engine", "forecast"],
        "chart:solar_return": ["engine", "solar"],
        "chart:horary": ["engine", "horar"],
        "matrix:ladini_22": ["matrix"],
        "numerology:pythagorean": ["numerology"],
        "human_design:human_design_classic": ["hd"]
      },
      unresolvedValues: ["chart:astrocartography", "chart:composite"],
      exemptValues: [],
      unknownValuePolicy: "deny",
      collectionMode: "not_applicable"
    }
  },
  "calculations.resource.link-client": {
    semanticKind: "mutation",
    requirement: {
      kind: "resource_capability",
      selector: "persisted CalculationRecord.module + CalculationRecord.methodCode",
      capabilityMap: {
        "chart:natal": ["engine", "natal"],
        "chart:synastry": ["engine", "synastry"],
        "chart:transit": ["engine", "forecast"],
        "chart:progression": ["engine", "forecast"],
        "chart:solar_return": ["engine", "solar"],
        "chart:horary": ["engine", "horar"],
        "matrix:ladini_22": ["matrix"],
        "numerology:pythagorean": ["numerology"],
        "human_design:human_design_classic": ["hd"]
      },
      unresolvedValues: ["chart:astrocartography", "chart:composite"],
      exemptValues: [],
      unknownValuePolicy: "deny",
      collectionMode: "not_applicable"
    }
  },
  "calculations.resource.publish": {
    semanticKind: "mutation",
    requirement: {
      kind: "resource_capability",
      selector: "persisted CalculationRecord.module + CalculationRecord.methodCode",
      capabilityMap: {
        "chart:natal": ["engine", "natal"],
        "chart:synastry": ["engine", "synastry"],
        "chart:transit": ["engine", "forecast"],
        "chart:progression": ["engine", "forecast"],
        "chart:solar_return": ["engine", "solar"],
        "chart:horary": ["engine", "horar"],
        "matrix:ladini_22": ["matrix"],
        "numerology:pythagorean": ["numerology"],
        "human_design:human_design_classic": ["hd"]
      },
      unresolvedValues: ["chart:astrocartography", "chart:composite"],
      exemptValues: [],
      unknownValuePolicy: "deny",
      collectionMode: "not_applicable"
    }
  },
  "calculations.resource.interpretation.create": {
    semanticKind: "mutation",
    requirement: {
      kind: "resource_capability",
      selector: "persisted CalculationRecord.module + CalculationRecord.methodCode",
      capabilityMap: {
        "chart:natal": ["engine", "natal"],
        "chart:synastry": ["engine", "synastry"],
        "chart:transit": ["engine", "forecast"],
        "chart:progression": ["engine", "forecast"],
        "chart:solar_return": ["engine", "solar"],
        "chart:horary": ["engine", "horar"],
        "matrix:ladini_22": ["matrix"],
        "numerology:pythagorean": ["numerology"],
        "human_design:human_design_classic": ["hd"]
      },
      unresolvedValues: ["chart:astrocartography", "chart:composite"],
      exemptValues: [],
      unknownValuePolicy: "deny",
      collectionMode: "not_applicable"
    }
  },
  "calculations.resource.interpretation.approve": {
    semanticKind: "mutation",
    requirement: {
      kind: "resource_capability",
      selector: "persisted CalculationRecord.module + CalculationRecord.methodCode",
      capabilityMap: {
        "chart:natal": ["engine", "natal"],
        "chart:synastry": ["engine", "synastry"],
        "chart:transit": ["engine", "forecast"],
        "chart:progression": ["engine", "forecast"],
        "chart:solar_return": ["engine", "solar"],
        "chart:horary": ["engine", "horar"],
        "matrix:ladini_22": ["matrix"],
        "numerology:pythagorean": ["numerology"],
        "human_design:human_design_classic": ["hd"]
      },
      unresolvedValues: ["chart:astrocartography", "chart:composite"],
      exemptValues: [],
      unknownValuePolicy: "deny",
      collectionMode: "not_applicable"
    }
  },
  "calculations.resource.archive": {
    semanticKind: "mutation",
    requirement: {
      kind: "resource_capability",
      selector: "persisted CalculationRecord.module + CalculationRecord.methodCode",
      capabilityMap: {
        "chart:natal": ["engine", "natal"],
        "chart:synastry": ["engine", "synastry"],
        "chart:transit": ["engine", "forecast"],
        "chart:progression": ["engine", "forecast"],
        "chart:solar_return": ["engine", "solar"],
        "chart:horary": ["engine", "horar"],
        "matrix:ladini_22": ["matrix"],
        "numerology:pythagorean": ["numerology"],
        "human_design:human_design_classic": ["hd"]
      },
      unresolvedValues: ["chart:astrocartography", "chart:composite"],
      exemptValues: [],
      unknownValuePolicy: "deny",
      collectionMode: "not_applicable"
    }
  },
  "media.upload-intent.create": {
    semanticKind: "mutation",
    requirement: {
      kind: "resource_capability",
      selector:
        "validated upload purpose from request; authenticated astrologer is entitlement subject",
      capabilityMap: { product_cover: ["products"] },
      unresolvedValues: [],
      exemptValues: [
        "profile_avatar",
        "profile_cover",
        "verification_identity_document",
        "verification_qualification_document"
      ],
      unknownValuePolicy: "deny",
      collectionMode: "not_applicable"
    }
  },
  "media.upload.complete": {
    semanticKind: "mutation",
    requirement: {
      kind: "resource_capability",
      selector: "persisted media_assets.purpose; request body is not entitlement authority",
      capabilityMap: { product_cover: ["products"] },
      unresolvedValues: [],
      exemptValues: [
        "profile_avatar",
        "profile_cover",
        "verification_identity_document",
        "verification_qualification_document"
      ],
      unknownValuePolicy: "deny",
      collectionMode: "not_applicable"
    }
  }
} as const;
