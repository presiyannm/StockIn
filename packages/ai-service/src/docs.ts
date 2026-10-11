import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { FastifyInstance } from "fastify";
import { SERVICE_TOKEN_HEADER } from "@stockin/shared";

/** Docs are served here; the token and key hooks in app.ts skip this prefix. */
export const DOCS_PREFIX = "/docs";

const secured = [{ serviceToken: [] }];
const language = { type: "string", enum: ["bg", "en", "other"] };
const errorBody = {
  type: "object",
  properties: { error: { type: "string" } },
};
const productsField = {
  type: "string",
  description:
    'JSON array of the shop catalogue: [{"id":1,"name":"...","barcode":"..."|null,"aliases":["..."]}]',
};

export const routeDocs = {
  health: {
    tags: ["system"],
    summary: "Liveness check (no token needed)",
    response: {
      200: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
          ai: { type: "boolean", description: "false when no Anthropic key is set" },
        },
      },
    },
  },
  extractInvoice: {
    tags: ["ai"],
    summary: "Read an invoice photo into structured lines",
    description: "Costs a Claude call. Lines it cannot match to the catalogue get product_id null.",
    security: secured,
    consumes: ["multipart/form-data"],
    body: {
      type: "object",
      required: ["image", "products"],
      properties: {
        image: { type: "string", format: "binary", description: "Invoice photo (repeat the field for extra pages)" },
        products: productsField,
      },
    },
    response: {
      200: {
        type: "object",
        properties: {
          supplier_name: { type: ["string", "null"], description: "Seller who issued the invoice, not the buyer" },
          invoice_number: { type: ["string", "null"] },
          invoice_date: { type: ["string", "null"], description: "YYYY-MM-DD" },
          language,
          lines: {
            type: "array",
            items: {
              type: "object",
              properties: {
                raw_text: { type: "string" },
                qty: { type: "number" },
                unit_price: { type: ["number", "null"] },
                product_id: { type: ["integer", "null"] },
                confidence: { type: "number", description: "0 to 1" },
              },
            },
          },
        },
      },
      400: errorBody,
      401: errorBody,
      503: errorBody,
    },
  },
  identifyProduct: {
    tags: ["ai"],
    summary: "Identify a catalogue product from a photo",
    description: "Costs a Claude call. Returns product_id null rather than guessing.",
    security: secured,
    consumes: ["multipart/form-data"],
    body: {
      type: "object",
      required: ["image", "products"],
      properties: {
        image: { type: "string", format: "binary", description: "Product photo" },
        products: productsField,
      },
    },
    response: {
      200: {
        type: "object",
        properties: {
          product_id: { type: ["integer", "null"] },
          confidence: { type: "number" },
          reason: { type: "string" },
        },
      },
      400: errorBody,
      401: errorBody,
      503: errorBody,
    },
  },
  draftMessage: {
    tags: ["ai"],
    summary: "Draft a supplier message about reported delivery problems",
    description: "Costs a Claude call. Always English; the resolution is stated separately by the shop.",
    security: secured,
    body: {
      type: "object",
      required: ["supplier", "items"],
      properties: {
        supplier: { type: "string" },
        invoiceNumber: { type: ["string", "null"] },
        items: { type: "array", items: { type: "string" } },
      },
    },
    response: {
      200: {
        type: "object",
        properties: {
          message: { type: "string" },
        },
      },
      401: errorBody,
      503: errorBody,
    },
  },
};

/**
 * Registers Swagger. The schemas above are documentation only: validation and
 * serialization are switched off so the routes behave exactly as before.
 */
export async function registerDocs(app: FastifyInstance) {
  // `value` replaces the request body, so hand the data back untouched.
  app.setValidatorCompiler(() => (data) => ({ value: data }));
  app.setSerializerCompiler(() => (data) => JSON.stringify(data));

  await app.register(swagger, {
    openapi: {
      info: {
        title: "StockIn ai-service",
        description:
          "Stateless service that reads invoices, identifies products and drafts supplier messages with Claude. It is called by packages/api, not by the phone app.",
        version: "1.0.0",
      },
      components: {
        securitySchemes: {
          serviceToken: { type: "apiKey", in: "header", name: SERVICE_TOKEN_HEADER },
        },
      },
    },
  });
  await app.register(swaggerUi, { routePrefix: DOCS_PREFIX });
}
