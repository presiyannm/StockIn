import type { FastifyInstance, FastifyRequest } from "fastify";
import type { DraftMessageRequest, Product } from "@stockin/shared";
import { aiEnabled } from "./claude/client.js";
import { routeDocs } from "./docs.js";
import type { ImageInput } from "./claude/content.js";
import { extractInvoice } from "./capabilities/extractInvoice.js";
import { identifyProduct } from "./capabilities/identifyProduct.js";
import { draftSupplierMessage } from "./capabilities/draftMessage.js";

/** Multipart with image files and a JSON `products` field (the catalogue). */
async function readRequest(req: FastifyRequest) {
  const files: ImageInput[] = [];
  let products: Product[] = [];
  for await (const part of req.parts()) {
    if (part.type === "file") {
      const data = await part.toBuffer();
      if (data.length) files.push({ data, contentType: part.mimetype });
    } else if (part.fieldname === "products") {
      products = JSON.parse(String(part.value));
    }
  }
  return { files, products };
}

export function registerRoutes(app: FastifyInstance) {
  app.get("/health", { schema: routeDocs.health }, async () => ({ ok: true, ai: aiEnabled }));

  app.post("/extract-invoice", { schema: routeDocs.extractInvoice }, async (req, reply) => {
    const { files, products } = await readRequest(req);
    if (!files.length) return reply.code(400).send({ error: "No invoice image" });
    return extractInvoice(files, products);
  });

  app.post("/identify-product", { schema: routeDocs.identifyProduct }, async (req, reply) => {
    const { files, products } = await readRequest(req);
    if (!files[0]) return reply.code(400).send({ error: "No photo" });
    return identifyProduct(files[0], products);
  });

  app.post("/draft-message", { schema: routeDocs.draftMessage }, async (req) =>
    draftSupplierMessage(req.body as DraftMessageRequest),
  );
}
