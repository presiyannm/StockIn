import type { ExtractedInvoice, Product } from "@stockin/shared";
import { callJson } from "../claude/callJson.js";
import { config } from "../config.js";
import { catalogueText, imageBlock, type ImageInput } from "../claude/content.js";

export function extractInvoice(
  images: ImageInput[],
  products: Product[],
): Promise<ExtractedInvoice> {
  return callJson<ExtractedInvoice>({
    model: config.models.extractInvoice,
    system:
      "You read delivery invoices and delivery notes (Bulgarian or English, possibly photographed at an angle) for a small shop. " +
      "Extract every product line exactly as printed. Never invent lines. If a number is unreadable, lower the confidence instead of guessing. " +
      "Match each line to the shop catalogue by product_id when you are reasonably sure, otherwise use null. " +
      "supplier_name is the seller who issued the invoice (Bulgarian: Доставчик or Продавач), never the buyer (Получател or Купувач).",
    content: [
      ...images.map(imageBlock),
      {
        type: "text",
        text: `Shop catalogue (id: name):\n${catalogueText(products)}\n\nExtract the invoice.`,
      },
    ],
    schema: {
      type: "object",
      properties: {
        supplier_name: {
          type: ["string", "null"],
          description: "Seller/issuer company name exactly as printed, not the buyer",
        },
        invoice_number: { type: ["string", "null"] },
        invoice_date: {
          type: ["string", "null"],
          description: "ISO date YYYY-MM-DD",
        },
        language: { type: "string", enum: ["bg", "en", "other"] },
        lines: {
          type: "array",
          items: {
            type: "object",
            properties: {
              raw_text: { type: "string", description: "Product text as printed" },
              qty: { type: "number" },
              unit_price: { type: ["number", "null"] },
              product_id: { type: ["integer", "null"] },
              confidence: { type: "number", description: "0 to 1" },
            },
            required: ["raw_text", "qty", "unit_price", "product_id", "confidence"],
          },
        },
      },
      required: ["supplier_name", "invoice_number", "invoice_date", "language", "lines"],
    },
  });
}
