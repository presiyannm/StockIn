// Hand-written OpenAPI document for the HTTP API. Static on purpose: routes carry no Fastify
// schemas, so request validation and responses stay exactly as `routes.ts` implements them.
// Keep it in step with `routes.ts` and the README table when a route changes.

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: object, description = "OK") => ({
  description,
  content: { "application/json": { schema } },
});
const err = (description: string) => json(ref("Error"), description);

const idParam = { name: "id", in: "path", required: true, schema: { type: "integer" } };
const deliveryId = { ...idParam, description: "Delivery id" };
const photoField = {
  type: "array",
  items: { type: "string", format: "binary" },
  description: "One or more image files",
};

export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "StockIn API",
    version: "1.0.0",
    description:
      "AI-assisted goods receiving. Delivery lifecycle: `draft -> scanning -> reconciled -> closed`. " +
      "Errors are `{ error }` with a matching status. No authentication.",
  },
  servers: [{ url: "/" }],
  tags: [
    { name: "System" },
    { name: "Catalogue" },
    { name: "Delivery" },
    { name: "Receiving" },
    { name: "Issues" },
    { name: "Finish & report" },
  ],
  paths: {
    "/api/health": {
      get: {
        tags: ["System"],
        summary: "Database and ai-service status",
        responses: {
          200: json({
            type: "object",
            properties: { ok: { type: "boolean" }, db: { type: "string" }, ai: { type: "boolean" } },
          }),
        },
      },
    },
    "/api/files/{key}": {
      get: {
        tags: ["System"],
        summary: "Serve a stored photo (local disk storage when R2 is not configured)",
        parameters: [
          { name: "key", in: "path", required: true, schema: { type: "string" }, description: "Storage key, may contain slashes" },
        ],
        responses: {
          200: { description: "Image bytes", content: { "image/*": { schema: { type: "string", format: "binary" } } } },
          404: err("Not found"),
        },
      },
    },
    "/api/products": {
      get: {
        tags: ["Catalogue"],
        summary: "List the product catalogue",
        responses: { 200: json({ type: "array", items: ref("Product") }) },
      },
    },
    "/api/suppliers": {
      get: {
        tags: ["Catalogue"],
        summary: "List suppliers",
        responses: { 200: json({ type: "array", items: ref("Supplier") }) },
      },
    },
    "/api/deliveries": {
      get: {
        tags: ["Delivery"],
        summary: "List the 50 most recent deliveries",
        responses: { 200: json({ type: "array", items: ref("DeliverySummary") }) },
      },
      post: {
        tags: ["Delivery"],
        summary: "Start a delivery",
        requestBody: {
          content: {
            "application/json": {
              schema: { type: "object", properties: { supplier_id: { type: "integer", nullable: true } } },
            },
          },
        },
        responses: { 200: json(ref("Delivery")) },
      },
    },
    "/api/deliveries/{id}": {
      get: {
        tags: ["Delivery"],
        summary: "Everything the screens need: lines, scans, findings, issues with photos, report",
        parameters: [deliveryId],
        responses: { 200: json(ref("DeliveryDetail")), 404: err("Delivery not found") },
      },
      patch: {
        tags: ["Delivery"],
        summary: "Set the requested resolution for the whole delivery",
        description: "Recorded once per delivery, as a choice plus an optional note. Copied to the report by finish.",
        parameters: [deliveryId],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  requested_resolution: { type: "string", enum: ["credit", "replacement"], nullable: true },
                  resolution_note: { type: "string", nullable: true },
                },
              },
            },
          },
        },
        responses: {
          200: json(ref("Delivery")),
          400: err("Invalid requested_resolution"),
          404: err("Delivery not found"),
          409: err("Delivery is already closed"),
        },
      },
    },
    "/api/deliveries/{id}/excess/{productId}": {
      put: {
        tags: ["Delivery"],
        summary: "Confirm (or take back) that extra units of a product may enter stock",
        parameters: [deliveryId, { name: "productId", in: "path", required: true, schema: { type: "integer" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object", required: ["accept"], properties: { accept: { type: "boolean" } } },
            },
          },
        },
        responses: {
          200: json({ type: "object", properties: { ok: { type: "boolean" }, accepted: { type: "boolean" } } }),
          400: err("accept (true/false) is required"),
          404: err("Delivery not found"),
          409: err("Delivery is already closed"),
        },
      },
    },
    "/api/deliveries/{id}/invoice": {
      post: {
        tags: ["Receiving"],
        summary: "Upload invoice photo(s); the AI reads all pages into invoice lines",
        description: "Re-reads the whole invoice when a page is added. Returns 503 if the AI service is down; nothing is stored then.",
        parameters: [deliveryId],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: { type: "object", required: ["photo"], properties: { photo: photoField } },
            },
          },
        },
        responses: {
          200: json({
            type: "object",
            properties: { language: { type: "string", enum: ["bg", "en", "other"] }, lines: { type: "integer" } },
          }),
          400: err("No invoice photo uploaded"),
          404: err("Delivery not found"),
          503: err("AI service unavailable"),
        },
      },
    },
    "/api/invoice-lines/{id}": {
      patch: {
        tags: ["Receiving"],
        summary: "Correct an invoice line (quantity or matched product)",
        parameters: [{ ...idParam, description: "Invoice line id" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { qty: { type: "number" }, product_id: { type: "integer", nullable: true } },
              },
            },
          },
        },
        responses: { 200: json(ref("InvoiceLine")) },
      },
    },
    "/api/deliveries/{id}/scans": {
      post: {
        tags: ["Receiving"],
        summary: "Record received goods by barcode or explicit product",
        parameters: [deliveryId],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                description: "Send `barcode`, or `product_id` (with optional `qty` and `method`).",
                properties: {
                  barcode: { type: "string" },
                  product_id: { type: "integer" },
                  qty: { type: "number", default: 1 },
                  method: { type: "string", enum: ["barcode", "vision", "manual"] },
                },
              },
            },
          },
        },
        responses: {
          200: json(ref("Scan")),
          400: err("Need barcode or product_id"),
          404: err("Unknown barcode"),
        },
      },
    },
    "/api/deliveries/{id}/scans/{productId}": {
      delete: {
        tags: ["Receiving"],
        summary: "Remove all scans of a product from the delivery",
        parameters: [deliveryId, { name: "productId", in: "path", required: true, schema: { type: "integer" } }],
        responses: { 200: json(ref("Ok")) },
      },
    },
    "/api/deliveries/{id}/identify": {
      post: {
        tags: ["Receiving"],
        summary: "Match a photo of an unlabelled item to the catalogue (AI)",
        parameters: [deliveryId],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: { type: "object", required: ["photo"], properties: { photo: { type: "string", format: "binary" } } },
            },
          },
        },
        responses: {
          200: json({
            type: "object",
            properties: {
              product: { allOf: [ref("Product")], nullable: true },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              reason: { type: "string" },
            },
          }),
          400: err("No photo uploaded"),
          503: err("AI service unavailable"),
        },
      },
    },
    "/api/deliveries/{id}/reconcile": {
      post: {
        tags: ["Receiving"],
        summary: "Compare invoice and scans into findings (idempotent)",
        parameters: [deliveryId],
        responses: { 200: json({ type: "array", items: ref("Finding") }) },
      },
    },
    "/api/deliveries/{id}/issues": {
      post: {
        tags: ["Issues"],
        summary: "Report a problem on any product, including a fully matched one",
        parameters: [deliveryId],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["product_id", "type"],
                properties: {
                  product_id: { type: "integer" },
                  type: { type: "string", enum: ["short", "expired", "damaged", "wrong_item", "other"] },
                  qty: { type: "number", default: 1 },
                  expiry_date: { type: "string", format: "date" },
                  note: { type: "string" },
                  voice_transcript: { type: "string" },
                  photo: photoField,
                },
              },
            },
          },
        },
        responses: { 200: json(ref("Issue")), 400: err("product_id and a valid type are required") },
      },
    },
    "/api/issues/{id}": {
      delete: {
        tags: ["Issues"],
        summary: "Remove a report",
        parameters: [{ ...idParam, description: "Issue id" }],
        responses: { 200: json(ref("Ok")) },
      },
    },
    "/api/deliveries/{id}/finish": {
      post: {
        tags: ["Finish & report"],
        summary: "Confirm: write stock, draft the supplier report, close the delivery",
        description:
          "Idempotent: on a closed delivery it returns the existing report and writes nothing. " +
          "Returns 409 when expired/damaged/wrong-item quantities exceed what was received.",
        parameters: [deliveryId],
        responses: {
          200: json(ref("Report")),
          404: err("Delivery not found"),
          409: json(
            {
              type: "object",
              properties: {
                error: { type: "string" },
                products: {
                  type: "array",
                  items: { type: "object", description: "Over-reported product with its received and reported quantities" },
                },
              },
            },
            "Defect reports exceed received quantity",
          ),
        },
      },
    },
    "/api/deliveries/{id}/report.html": {
      get: {
        tags: ["Finish & report"],
        summary: "Printable English supplier report",
        parameters: [deliveryId],
        responses: {
          200: { description: "HTML page", content: { "text/html": { schema: { type: "string" } } } },
          404: err("No report yet"),
        },
      },
    },
  },
  components: {
    schemas: {
      Error: { type: "object", properties: { error: { type: "string" } }, required: ["error"] },
      Ok: { type: "object", properties: { ok: { type: "boolean" } } },
      Product: {
        type: "object",
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          barcode: { type: "string", nullable: true },
          aliases: { type: "array", items: { type: "string" } },
        },
      },
      Supplier: {
        type: "object",
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          email: { type: "string", nullable: true },
          phone: { type: "string", nullable: true },
        },
      },
      Delivery: {
        type: "object",
        properties: {
          id: { type: "integer" },
          supplier_id: { type: "integer", nullable: true },
          invoice_number: { type: "string", nullable: true },
          invoice_date: { type: "string", format: "date", nullable: true },
          status: { type: "string", enum: ["draft", "scanning", "reconciled", "closed"] },
          requested_resolution: { type: "string", enum: ["credit", "replacement"], nullable: true },
          resolution_note: { type: "string", nullable: true },
          created_at: { type: "string", format: "date-time" },
          closed_at: { type: "string", format: "date-time", nullable: true },
        },
      },
      DeliverySummary: {
        type: "object",
        properties: {
          id: { type: "integer" },
          status: { type: "string", enum: ["draft", "scanning", "reconciled", "closed"] },
          invoice_number: { type: "string", nullable: true },
          invoice_date: { type: "string", format: "date", nullable: true },
          created_at: { type: "string", format: "date-time" },
          supplier_name: { type: "string", nullable: true },
        },
      },
      InvoiceLine: {
        type: "object",
        properties: {
          id: { type: "integer" },
          delivery_id: { type: "integer" },
          product_id: { type: "integer", nullable: true },
          product_name: { type: "string", nullable: true },
          raw_text: { type: "string" },
          qty: { type: "number", description: "Expected quantity from the invoice" },
          unit_price: { type: "number", nullable: true },
          confidence: { type: "number", nullable: true },
          received_qty: { type: "number", description: "Only on GET /api/deliveries/{id}" },
        },
      },
      Scan: {
        type: "object",
        properties: {
          id: { type: "integer" },
          delivery_id: { type: "integer" },
          product_id: { type: "integer" },
          qty: { type: "number" },
          method: { type: "string", enum: ["barcode", "vision", "manual"] },
          created_at: { type: "string", format: "date-time" },
        },
      },
      Finding: {
        type: "object",
        description: "Automated comparison result; kept separate from human issues.",
        properties: {
          id: { type: "integer" },
          delivery_id: { type: "integer" },
          invoice_line_id: { type: "integer", nullable: true },
          product_id: { type: "integer", nullable: true },
          type: { type: "string", enum: ["short", "missing", "extra", "mismatch"] },
          expected_qty: { type: "number" },
          received_qty: { type: "number" },
          detail: { type: "string", nullable: true },
        },
      },
      Issue: {
        type: "object",
        description: "Human-reported problem. expired, damaged and wrong_item quantities are kept out of stock.",
        properties: {
          id: { type: "integer" },
          delivery_id: { type: "integer" },
          product_id: { type: "integer" },
          product_name: { type: "string" },
          finding_id: { type: "integer", nullable: true },
          type: { type: "string", enum: ["short", "expired", "damaged", "wrong_item", "other"] },
          qty: { type: "number" },
          expiry_date: { type: "string", format: "date", nullable: true },
          note: { type: "string", nullable: true },
          voice_transcript: { type: "string", nullable: true },
          created_at: { type: "string", format: "date-time" },
          photos: { type: "array", items: ref("Photo") },
        },
      },
      Photo: {
        type: "object",
        properties: { id: { type: "integer" }, issue_id: { type: "integer" }, url: { type: "string" } },
      },
      Report: {
        type: "object",
        properties: {
          id: { type: "integer" },
          delivery_id: { type: "integer" },
          body: { type: "string", description: "English supplier report: every delivery item plus problems" },
          requested_resolution: { type: "string", nullable: true },
          created_at: { type: "string", format: "date-time" },
        },
      },
      DeliveryDetail: {
        type: "object",
        properties: {
          delivery: {
            allOf: [ref("Delivery")],
            properties: { supplier_name: { type: "string", nullable: true }, supplier_email: { type: "string", nullable: true } },
          },
          files: {
            type: "array",
            items: {
              type: "object",
              properties: { id: { type: "integer" }, r2_key: { type: "string" }, page_no: { type: "integer" }, url: { type: "string" } },
            },
          },
          lines: { type: "array", items: ref("InvoiceLine") },
          scans: {
            type: "array",
            items: {
              type: "object",
              properties: { product_id: { type: "integer" }, product_name: { type: "string" }, qty: { type: "number" } },
            },
          },
          findings: { type: "array", items: ref("Finding") },
          issues: { type: "array", items: ref("Issue") },
          excess_accepted: { type: "array", items: { type: "integer" }, description: "Product ids whose extra units were confirmed" },
          report: { allOf: [ref("Report")], nullable: true },
        },
      },
    },
  },
};
