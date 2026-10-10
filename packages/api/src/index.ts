import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { config } from "./config.js";
import { openApiDocument } from "./openapi.js";
import { registerRoutes } from "./routes.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(multipart, { limits: { fileSize: 15 * 1024 * 1024 } });
await app.register(swagger, { mode: "static", specification: { document: openApiDocument as any } });
await app.register(swaggerUi, { routePrefix: "/docs" });
app.get("/", { schema: { hide: true } }, (_req, reply) => reply.redirect("/docs"));
await registerRoutes(app);

await app.listen({ port: config.port, host: "0.0.0.0" });
