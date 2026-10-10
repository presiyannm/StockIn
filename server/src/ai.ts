import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";

export type Product = { id: number; name: string; barcode: string | null; aliases: string[] };

export type ImageInput = { data: Buffer; contentType: string };

export type ExtractedInvoice = {
  supplier_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null; // YYYY-MM-DD
  language: "bg" | "en" | "other";
  lines: {
    raw_text: string;
    qty: number;
    unit_price: number | null;
    product_id: number | null;
    confidence: number;
  }[];
};

export const aiEnabled = Boolean(config.anthropicKey);

const client = aiEnabled ? new Anthropic({
      apiKey: config.anthropicKey,
      defaultHeaders: config.anthropicWorkspaceId
        ? { "anthropic-workspace-id": config.anthropicWorkspaceId }
        : undefined,
    }) : null;

function requireClient(): Anthropic {
  if (!client) throw new Error("ANTHROPIC_API_KEY is not set in .env");
  return client;
}

type ImageMedia = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

function imageBlock(img: ImageInput) {
  return {
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: img.contentType as ImageMedia,
      data: img.data.toString("base64"),
    },
  };
}

function catalogueText(products: Product[]): string {
  return products
    .map(
      (p) =>
        `${p.id}: ${p.name}${p.barcode ? ` [barcode ${p.barcode}]` : ""}${
          p.aliases.length ? ` (also: ${p.aliases.join(", ")})` : ""
        }`,
    )
    .join("\n");
}

type Schema = Record<string, any>;

/** Structured outputs want closed objects and anyOf instead of ["x","null"]. */
function strictSchema(node: Schema): Schema {
  if (Array.isArray(node)) return node.map(strictSchema) as unknown as Schema;
  if (node === null || typeof node !== "object") return node;
  const out: Schema = {};
  for (const [k, v] of Object.entries(node)) {
    out[k] = k === "properties"
      ? Object.fromEntries(Object.entries(v as Schema).map(([n, p]) => [n, strictSchema(p)]))
      : strictSchema(v);
  }
  if (Array.isArray(out.type) && out.type.includes("null")) {
    const { type, ...rest } = out;
    const base = type.filter((t: string) => t !== "null");
    return { ...rest, anyOf: [{ type: base.length === 1 ? base[0] : base }, { type: "null" }] };
  }
  if (out.type === "object") out.additionalProperties = false;
  return out;
}

/** Asks for JSON matching the schema (structured outputs, no forced tool call). */
async function callJson<T>(opts: {
  system: string;
  content: Anthropic.ContentBlockParam[];
  schema: Schema;
  maxTokens?: number;
}): Promise<T> {
  const res = await requireClient().messages.create({
    model: config.claudeModel,
    max_tokens: opts.maxTokens ?? 4096,
    system: opts.system,
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: strictSchema(opts.schema) },
    },
    messages: [{ role: "user", content: opts.content }],
  });
  if (res.stop_reason === "refusal") throw new Error("The model declined this request");
  if (res.stop_reason === "max_tokens") throw new Error("The model response was cut off");
  const block = res.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("Model returned no structured result");
  return JSON.parse(block.text) as T;
}

export function extractInvoice(
  images: ImageInput[],
  products: Product[],
): Promise<ExtractedInvoice> {
  return callJson<ExtractedInvoice>({
    system:
      "You read delivery invoices and delivery notes (Bulgarian or English, possibly photographed at an angle) for a small shop. " +
      "Extract every product line exactly as printed. Never invent lines. If a number is unreadable, lower the confidence instead of guessing. " +
      "Match each line to the shop catalogue by product_id when you are reasonably sure, otherwise use null.",
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
        supplier_name: { type: ["string", "null"] },
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

export async function identifyProduct(
  image: ImageInput,
  products: Product[],
): Promise<{ product_id: number | null; confidence: number; reason: string }> {
  return callJson({
    system:
      "You identify a grocery product from a photo by matching it to the shop catalogue. " +
      "If it is not clearly one catalogue product, return null. Never guess.",
    content: [
      imageBlock(image),
      { type: "text", text: `Catalogue (id: name):\n${catalogueText(products)}\n\nWhich product is in the photo?` },
    ],
    schema: {
      type: "object",
      properties: {
        product_id: { type: ["integer", "null"] },
        confidence: { type: "number" },
        reason: { type: "string" },
      },
      required: ["product_id", "confidence", "reason"],
    },
    maxTokens: 512,
  });
}

export async function draftSupplierMessage(input: {
  language: "bg" | "en" | "other";
  supplier: string;
  invoiceNumber: string | null;
  items: string[];
}): Promise<{ message: string; requested_resolution: string }> {
  return callJson({
    system:
      "You write short, polite, factual messages from a small shop to a supplier about problems with a delivery. " +
      "Do not invent facts or quantities; use only the items given. No threats.",
    content: [
      {
        type: "text",
        text:
          `Write the cover message in ${input.language === "bg" ? "Bulgarian" : "English"}.\n` +
          `Supplier: ${input.supplier}\nInvoice: ${input.invoiceNumber ?? "n/a"}\nReported items:\n` +
          input.items.map((i) => `- ${i}`).join("\n") +
          `\n\nAlso state in one short sentence the requested resolution (credit note or replacement).`,
      },
    ],
    schema: {
      type: "object",
      properties: {
        message: { type: "string" },
        requested_resolution: { type: "string" },
      },
      required: ["message", "requested_resolution"],
    },
    maxTokens: 1024,
  });
}
