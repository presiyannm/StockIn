import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { SERVICE_TOKEN_HEADER } from "@stockin/shared";
import { config } from "./config.js";
import { aiEnabled } from "./claude/client.js";
import { DOCS_PREFIX, registerDocs } from "./docs.js";
import { registerRoutes } from "./routes.js";

const isOpen = (url: string) => url === "/health" || url.startsWith(DOCS_PREFIX);

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(multipart, { limits: { fileSize: 15 * 1024 * 1024 } });
  await registerDocs(app);

  app.addHook("onRequest", async (req, reply) => {
    if (isOpen(req.url) || !config.serviceToken) return;
    if (req.headers[SERVICE_TOKEN_HEADER] !== config.serviceToken) {
      return reply.code(401).send({ error: "Bad or missing service token" });
    }
  });

  app.addHook("preHandler", async (req, reply) => {
    if (!isOpen(req.url) && !aiEnabled) {
      return reply.code(503).send({ error: "ANTHROPIC_API_KEY is not set" });
    }
  });

  registerRoutes(app);
  return app;
}
