# StockIn — Business Requirements

This document defines shared product behavior for the AI, API and frontend implementations. It supplements the project's existing AGENTS.md and CLAUDE.md settings.

These are the agreed MVP requirements, not a claim that every behavior is already implemented. For product behavior, the confirmed decisions here take precedence over older descriptions in the repository; existing technical settings and contributor instructions remain in effect. In particular, supplier reports are English even when the invoice is Bulgarian.

## Product objective

Help small businesses receive deliveries with less manual data entry: read the invoice, record what arrived, identify quantity and quality problems, update inventory after human confirmation, and produce a supplier report.

The primary user is the employee receiving goods. The initial target is a small grocery shop. Time savings and commercial demand are hypotheses to validate, not measured claims.

There is no time for customer interviews before this one-day hackathon. Present customer needs and business benefits as assumptions, without invented statistics. A subscription per shop is a possible future business model, not an MVP feature.

## Required workflow

1. **Capture the invoice:** photograph or upload one or more invoice pages. Retain the original images.
2. **Review expected goods:** AI extracts invoice details, products and expected quantities. The user can correct errors and confirm product matches.
3. **Record received goods:** scan barcodes, use photo-based product identification or enter products and quantities manually.
4. **Resolve unknown products:** when a product cannot be matched to the catalogue, let the user select an existing product or create a new one, then continue.
5. **Compare and report problems:** show expected versus received quantities and flag missing, short, extra or incorrect goods. Allow human reports on every product.
6. **Confirm the delivery:** show the stock allocation and recorded issues for human review before updating inventory.
7. **Produce the final report:** generate an English report containing every delivery item and all discrepancies and human reports. Allow printing or saving as PDF for the supplier or driver.

## Functional requirements

| ID | Requirement |
|---|---|
| BR-01 | Keep invoice images, expected items, received items, findings, issues, photos and the final report linked to the same delivery session. |
| BR-02 | Allow human correction of AI-extracted invoice fields and proposed product matches. |
| BR-03 | Record actual received quantities separately from expected quantities. |
| BR-04 | Keep a Report action available on every product during receiving and review, including a fully matched line such as 12/12. |
| BR-05 | Support issue types: shortage, expired, damaged, wrong item and other. Capture affected quantity, notes, applicable expiry date and optional photo evidence. |
| BR-06 | Preserve automated comparison findings separately from human-reported issues; include both in the final report. |
| BR-07 | After human confirmation, add acceptable received goods to stock; unsuitable received goods (expired, damaged, wrong item) are not counted in stock and are kept only in the report. |
| BR-08 | Prevent duplicate stock additions if finalization is clicked or requested more than once. |
| BR-09 | Store the completed delivery and final statement so they can be retrieved later. |

## Business rules

- A quantity match does not mean the goods are acceptable: 12 received out of 12 expected may still include 3 expired units.
- Expected quantities come from the reviewed invoice; received quantities represent goods physically received, including unsuitable goods.
- Sellable quantity equals received quantity minus unsuitable quantity. There is no quarantine stock: goods are either sellable or not counted in inventory.
- Missing goods do not increase stock.
- Unsuitable quantities must not exceed received quantities, and the same physical units must not be counted twice because they have multiple defects.
- Differences must remain visible. Do not silently alter counts or accept product substitutions to make a delivery match its invoice.
- Resolving an unknown product's catalogue identity does not automatically resolve a delivery discrepancy.
- Compare like units. Do not silently assume that one case, pack or box equals one individual item.
- Quantity calculations must be deterministic. AI assists with extraction, identification and explanations; it must not override saved counts or invent facts.
- Reports and inventory updates must use the latest saved, human-reviewed delivery data.
- Preserve invoice and expiry dates as the original calendar dates.

## Final report requirements

The report must be in **English** and contain **all delivery items**, including correctly received items. Include:

- Delivery reference, supplier and invoice number/date where available.
- Product names and units, expected and received quantities, and sellable and unsuitable (not counted in stock) quantities.
- Quantity discrepancies and all human-reported issues, with affected quantities, notes and applicable expiry dates.
- Supporting photos associated with their issues, available for review.
- Requested resolution, such as credit or replacement, when supplied by the user.

AI may draft the explanatory text, but the report must accurately reflect saved records. Printing or exporting does not mean a supplier has accepted a claim or that a message has been sent.

## Data and agreed constraints

Persist: deliveries, invoice files, invoice lines, products, suppliers, received-item records/scans, comparison findings, issues, issue photos, final reports and stock movements.

The agreed prototype runs locally, with local PostgreSQL, Claude API for AI functions and Cloudflare R2 for photos. This is a one-day hackathon MVP; external AI and photo services still require connectivity.

Automatic counting from photos, voice input, automatic supplier emails, payments and external inventory integrations are not required for the core MVP.

## Acceptance examples

| Scenario | Expected result |
|---|---|
| Invoice quantity was misread | User corrects it; comparison and report use the corrected value. |
| Expected 24, received 20 acceptable units | Show shortage of 4; add 20 sellable units. |
| Expected 12, received 12, with 3 expired | Report remains available; retain issue evidence; add 9 units to stock; the 3 expired units are not counted and appear only in the report. |
| Product barcode is unknown | Allow matching to an existing product or creating a new one without losing session data. |
| Delivery contains both correct items and problems | English report includes all items and every recorded problem. |
| Finalization is requested twice | Inventory is updated only once. |

## Product decisions

Confirmed by the product owner. All components use these; do not assume differently.

- **Languages:** the interface is English. Invoices may be Bulgarian or English and the AI reads both. The supplier report is always English.
- **Excess goods:** extra units of an invoiced product are shown as an `extra` finding. They enter sellable stock only after the user explicitly confirms them at the confirmation step.
- **Stock:** no quarantine bucket. Received goods are either sellable (added to stock) or unsuitable (expired, damaged, wrong item: not counted, recorded only in the report).
- **`other` issues:** informational; they never affect stock.
- **Pack-to-unit conversion:** not supported in the MVP. Only like units are compared; a unit mismatch is flagged for human review.
- **Requested resolution:** optional free text, recorded once per delivery (for example "Credit for the 3 expired units").
- **Catalogue from the invoice:** when the AI reads the invoice, an unknown supplier is added to the suppliers, and invoice products the catalogue does not know are added as products so later scans count against them. The user can still re-link any line to a different product.
- **Missing vs no match:** an invoiced item that never turns up in scans or photos is **missing**. Goods received that are not on the invoice at all (the invoice says "dog food", "cat food" arrived) are a **no match** finding. Like extra units, they enter stock only after the user explicitly confirms them.
- **Report narrative:** not editable before printing. It is generated from saved records, so the printed report cannot drift from them.

## Implementation status of these decisions

Nothing is known to differ from the decisions above right now. If a component drifts, list it here and fix it across components together, updating `packages/shared` and the README API table in the same change.

## Integration priority

Agree on the API/AI data contracts early, using `packages/shared` for shared types and the README HTTP API table for the frontend contract. Use the same meanings for expected, received and sellable quantities, product matches and issues across all contributors. Integrate one complete delivery flow, including confirmation, stock updates and the supplier report, before polishing separate components.
