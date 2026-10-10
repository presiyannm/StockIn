import Fastify, { type FastifyRequest } from "fastify";
import multipart from "@fastify/multipart";
import {
  SERVICE_TOKEN_HEADER,
  type DraftMessageRequest,
  type Product,
} from "@stockin/shared";
import { config } from "./config.js";
import {
  aiEnabled,
  draftSupplierMessage,
  extractInvoice,
  identifyProduct,
  type ImageInput,
} from "./ai.js";

const app = Fastify({ logger: true });

await app.register(multipart, { limits: { fileSize: 15 * 1024 * 1024 } });

app.addHook("onRequest", async (req, reply) => {
  if (req.url === "/health" || !config.serviceToken) return;
  if (req.headers[SERVICE_TOKEN_HEADER] !== config.serviceToken) {
    return reply.code(401).send({ error: "Bad or missing service token" });
  }
});

app.addHook("preHandler", async (req, reply) => {
  if (req.url !== "/health" && !aiEnabled) {
    return reply.code(503).send({ error: "ANTHROPIC_API_KEY is not set" });
  }
});

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

app.get("/health", async () => ({ ok: true, ai: aiEnabled }));

app.post("/extract-invoice", async (req, reply) => {
  const { files, products } = await readRequest(req);
  if (!files.length) return reply.code(400).send({ error: "No invoice image" });
  return extractInvoice(files, products);
});

app.post("/identify-product", async (req, reply) => {
  const { files, products } = await readRequest(req);
  if (!files[0]) return reply.code(400).send({ error: "No photo" });
  return identifyProduct(files[0], products);
});

app.post("/draft-message", async (req) =>
  draftSupplierMessage(req.body as DraftMessageRequest),
);

await app.listen({ port: config.port, host: "0.0.0.0" });
