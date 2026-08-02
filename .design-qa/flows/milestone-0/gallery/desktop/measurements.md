# Flows gallery desktop comparison

Date: 2026-08-02 MSK

Viewport: 1440 x 900, DPR 1.

Reference: `http://localhost:8000/ElevenHouse.html`, Cabinet -> Flows.
Production: `http://localhost:5174/flows`, authenticated astrologer session.

## Measured geometry

| Element | Reference | Production |
| --- | --- | --- |
| Main workspace | x 248, width 1192, height 900 | x 248, y 68, width 1192, height 832 |
| First visible card | x 272, y 148, 370.66 x 211.25 | x 284, y 183, 362.66 x 207 |
| First card border | 1px rgba(216, 212, 236, 0.08) | 1px rgba(216, 212, 236, 0.14) |
| First card radius | 20px | 20px |
| Horizontal overflow | 0px | 0px |

Both states use a three-column gallery at this viewport. The production shell
has a 68px application header, while the prototype main region begins at y 0.

## Product-visible differences

- The reference uses four named scenarios, rich node-icon paths and illustrative
  completion/conversion metrics.
- Production shows five persisted definitions: four drafts and one paused
  legacy definition. Names and graph content are current database data, not
  substituted reference fixtures.
- Production metrics are dashes because legacy preview rows are not accepted as
  business execution. This is an intentional integrity deviation.
- Full content density, scenario naming, node-path parity and final visual
  polish remain Milestone 4 scope; this evidence does not claim final parity.

Artifacts: `reference.png`, `production.png`.
