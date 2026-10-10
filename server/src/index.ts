import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { config } from "./config.js";
import { query } from "./db.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(multipart, { limits: { fileSize: 15 * 1024 * 1024 } });

app.get("/api/health", async () => {
  const [row] = await query<{ ok: number }>("SELECT 1 AS ok");
  return { ok: row.ok === 1, db: "connected" };
});

await app.listen({ port: config.port, host: "0.0.0.0" });
