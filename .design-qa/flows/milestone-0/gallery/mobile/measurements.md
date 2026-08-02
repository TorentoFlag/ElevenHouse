# Flows gallery mobile comparison

Date: 2026-08-02 MSK

Viewport: 390 x 844, DPR 1, mobile and touch emulation.

Reference: `http://localhost:8000/ElevenHouse.html`, exact Flows state selected
through the prototype navigation handler.
Production: `http://localhost:5174/flows`, authenticated astrologer session.

## Measured geometry

| Element | Reference | Production |
| --- | --- | --- |
| Main workspace | x 0, width 390, height 844 | x 72, y 68, width 318, height 776 |
| First visible card | x 24, y 148, 322 x 244.38 | x 88, y 124.5, 286 x 173.65 |
| Visible cards | 4 | 5 |
| Horizontal overflow | 0px | 0px |

The prototype keeps its full decorative flow cards. Production uses a compact
monitoring list beside the persistent 72px application rail. Text, controls and
cards remain inside the viewport with no horizontal overflow.

The compact production presentation is usable but is not final design parity:
node-path icon density, card hierarchy and mobile rail treatment remain
Milestone 4 work. Runtime status and metrics stay honest in this milestone.

Artifacts: `reference.png`, `production.png`.
