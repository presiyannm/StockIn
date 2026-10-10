import type { FastifyInstance, FastifyRequest } from "fastify";
import { pool, query } from "./db.js";
import type { Product } from "@stockin/shared";
import {
  AiServiceError,
  aiAvailable,
  draftSupplierMessage,
  extractInvoice,
  identifyProduct,
  type ImageInput,
} from "./aiClient.js";
import { reconcile, stockSplit } from "./reconcile.js";
import { downloadPhoto, photoUrl, uploadPhoto } from "./storage.js";
import { renderReportHtml } from "./reportHtml.js";

type Parsed = { fields: Record<string, string>; files: ImageInput[] };

/** Reads a multipart request: text fields plus image files. */
async function readMultipart(req: FastifyRequest): Promise<Parsed> {
  const out: Parsed = { fields: {}, files: [] };
  for await (const part of req.parts()) {
    if (part.type === "file") {
      const data = await part.toBuffer();
      if (data.length) out.files.push({ data, contentType: part.mimetype });
    } else {
      out.fields[part.fieldname] = String(part.value);
    }
  }
  return out;
}

const allProducts = () =>
  query<Product>("SELECT id, name, barcode, aliases FROM products ORDER BY id");

async function getDelivery(id: number) {
  const [delivery] = await query(
    `SELECT d.*, s.name AS supplier_name, s.email AS supplier_email
       FROM deliveries d LEFT JOIN suppliers s ON s.id = d.supplier_id
      WHERE d.id = $1`,
    [id],
  );
  return delivery as Record<string, any> | undefined;
}

export async function registerRoutes(app: FastifyInstance) {
  app.setErrorHandler((err: Error, req, reply) => {
    if (err instanceof AiServiceError) {
      return reply.code(503).send({ error: err.message });
    }
    req.log.error(err);
    return reply.code((err as any).statusCode ?? 500).send({ error: err.message });
  });

  app.get("/api/health", async () => {
    const [row] = await query<{ ok: number }>("SELECT 1 AS ok");
    return { ok: row.ok === 1, db: "connected", ai: await aiAvailable() };
  });

  app.get("/api/files/*", async (req, reply) => {
    const key = (req.params as { "*": string })["*"];
    try {
      const { data, contentType } = await downloadPhoto(key);
      return reply.type(contentType).send(data);
    } catch {
      return reply.code(404).send({ error: "Not found" });
    }
  });

  app.get("/api/products", () => allProducts());
  app.get("/api/suppliers", () => query("SELECT * FROM suppliers ORDER BY name"));

  app.get("/api/deliveries", () =>
    query(
      `SELECT d.id, d.status, d.invoice_number, d.invoice_date, d.created_at,
              s.name AS supplier_name
         FROM deliveries d LEFT JOIN suppliers s ON s.id = d.supplier_id
        ORDER BY d.id DESC LIMIT 50`,
    ),
  );

  app.post("/api/deliveries", async (req) => {
    const body = (req.body ?? {}) as { supplier_id?: number };
    const [row] = await query(
      "INSERT INTO deliveries (supplier_id) VALUES ($1) RETURNING *",
      [body.supplier_id ?? null],
    );
    return row;
  });

  // Everything the screens need in one call.
  app.get("/api/deliveries/:id", async (req, reply) => {
    const id = Number((req.params as any).id);
    const delivery = await getDelivery(id);
    if (!delivery) return reply.code(404).send({ error: "Delivery not found" });

    const files = await query(
      "SELECT id, r2_key, page_no FROM invoice_files WHERE delivery_id = $1 ORDER BY page_no",
      [id],
    );
    const lines = await query(
      `SELECT l.*, p.name AS product_name,
              COALESCE((SELECT SUM(qty) FROM scans s
                         WHERE s.delivery_id = l.delivery_id
                           AND s.product_id = l.product_id), 0)::float AS received_qty
         FROM invoice_lines l LEFT JOIN products p ON p.id = l.product_id
        WHERE l.delivery_id = $1 ORDER BY l.id`,
      [id],
    );
    const scans = await query(
      `SELECT s.product_id, p.name AS product_name, SUM(s.qty)::float AS qty
         FROM scans s JOIN products p ON p.id = s.product_id
        WHERE s.delivery_id = $1 GROUP BY s.product_id, p.name ORDER BY p.name`,
      [id],
    );
    const findings = await query(
      "SELECT * FROM findings WHERE delivery_id = $1 ORDER BY id",
      [id],
    );
    const issues = await query(
      `SELECT i.*, p.name AS product_name FROM issues i
         JOIN products p ON p.id = i.product_id
        WHERE i.delivery_id = $1 ORDER BY i.id`,
      [id],
    );
    const photos = await query(
      `SELECT ph.id, ph.issue_id, ph.r2_key FROM issue_photos ph
         JOIN issues i ON i.id = ph.issue_id WHERE i.delivery_id = $1`,
      [id],
    );
    const [report] = await query(
      "SELECT * FROM reports WHERE delivery_id = $1 ORDER BY id DESC LIMIT 1",
      [id],
    );

    const photoList = await Promise.all(
      photos.map(async (p) => ({ id: p.id, issue_id: p.issue_id, url: await photoUrl(p.r2_key) })),
    );

    return {
      delivery,
      files: await Promise.all(
        files.map(async (f) => ({ ...f, url: await photoUrl(f.r2_key) })),
      ),
      lines,
      scans,
      findings,
      issues: issues.map((i) => ({
        ...i,
        photos: photoList.filter((p) => p.issue_id === i.id),
      })),
      report: report ?? null,
    };
  });

  // Step 1: photograph the invoice. Stores pages and has Claude read them.
  app.post("/api/deliveries/:id/invoice", async (req, reply) => {
    const id = Number((req.params as any).id);
    if (!(await getDelivery(id))) {
      return reply.code(404).send({ error: "Delivery not found" });
    }
    const { files } = await readMultipart(req);
    if (!files.length) return reply.code(400).send({ error: "No invoice photo uploaded" });
    // Check before storing anything, so a down ai-service leaves no half-saved invoice.
    if (!(await aiAvailable())) {
      return reply.code(503).send({ error: "The AI service is unavailable, cannot read the invoice" });
    }

    const keys = await Promise.all(
      files.map((f) => uploadPhoto(`invoices/${id}`, f.data, f.contentType)),
    );
    const [{ max }] = await query<{ max: number }>(
      "SELECT COALESCE(MAX(page_no), 0) AS max FROM invoice_files WHERE delivery_id = $1",
      [id],
    );
    for (const [i, key] of keys.entries()) {
      await query(
        "INSERT INTO invoice_files (delivery_id, r2_key, page_no) VALUES ($1, $2, $3)",
        [id, key, max + i + 1],
      );
    }

    // Read all pages of this delivery, so adding a page re-reads the whole invoice.
    const stored = await query<{ r2_key: string }>(
      "SELECT r2_key FROM invoice_files WHERE delivery_id = $1 ORDER BY page_no",
      [id],
    );
    const images = await Promise.all(stored.map((s) => downloadPhoto(s.r2_key)));
    const products = await allProducts();
    const invoice = await extractInvoice(images, products);

    const validIds = new Set(products.map((p) => p.id));
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM invoice_lines WHERE delivery_id = $1", [id]);
      for (const l of invoice.lines) {
        await client.query(
          `INSERT INTO invoice_lines (delivery_id, product_id, raw_text, qty, unit_price, confidence)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            id,
            l.product_id != null && validIds.has(l.product_id) ? l.product_id : null,
            l.raw_text,
            l.qty,
            l.unit_price,
            l.confidence,
          ],
        );
      }
      let supplierId: number | null = null;
      if (invoice.supplier_name) {
        const found = await client.query(
          "SELECT id FROM suppliers WHERE name ILIKE $1 LIMIT 1",
          [`%${invoice.supplier_name}%`],
        );
        supplierId =
          found.rows[0]?.id ??
          (
            await client.query(
              "INSERT INTO suppliers (name) VALUES ($1) RETURNING id",
              [invoice.supplier_name],
            )
          ).rows[0].id;
      }
      await client.query(
        `UPDATE deliveries
            SET invoice_number = $2, invoice_date = $3,
                supplier_id = COALESCE($4, supplier_id), status = 'scanning'
          WHERE id = $1`,
        [id, invoice.invoice_number, invoice.invoice_date, supplierId],
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
    return { language: invoice.language, lines: invoice.lines.length };
  });

  // "Fix a line": correct qty or the matched product.
  app.patch("/api/invoice-lines/:id", async (req) => {
    const id = Number((req.params as any).id);
    const b = req.body as { qty?: number; product_id?: number | null };
    const [row] = await query(
      `UPDATE invoice_lines
          SET qty = COALESCE($2, qty),
              product_id = CASE WHEN $3::boolean THEN $4 ELSE product_id END
        WHERE id = $1 RETURNING *`,
      [id, b.qty ?? null, "product_id" in b, b.product_id ?? null],
    );
    return row;
  });

  // Step 2: scan. Either a barcode or an explicit product (vision/manual).
  app.post("/api/deliveries/:id/scans", async (req, reply) => {
    const id = Number((req.params as any).id);
    const b = req.body as {
      barcode?: string;
      product_id?: number;
      qty?: number;
      method?: "barcode" | "vision" | "manual";
    };
    let productId = b.product_id;
    if (!productId && b.barcode) {
      const [p] = await query<{ id: number }>(
        "SELECT id FROM products WHERE barcode = $1",
        [b.barcode.trim()],
      );
      if (!p) return reply.code(404).send({ error: "Unknown barcode", barcode: b.barcode });
      productId = p.id;
    }
    if (!productId) return reply.code(400).send({ error: "Need barcode or product_id" });
    const [row] = await query(
      `INSERT INTO scans (delivery_id, product_id, qty, method)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [id, productId, b.qty ?? 1, b.method ?? (b.barcode ? "barcode" : "manual")],
    );
    return row;
  });

  app.delete("/api/deliveries/:id/scans/:productId", async (req) => {
    const p = req.params as any;
    await query("DELETE FROM scans WHERE delivery_id = $1 AND product_id = $2", [
      Number(p.id),
      Number(p.productId),
    ]);
    return { ok: true };
  });

  // Photo of an item with no readable barcode: Claude matches it to the catalogue.
  app.post("/api/deliveries/:id/identify", async (req, reply) => {
    const { files } = await readMultipart(req);
    if (!files[0]) return reply.code(400).send({ error: "No photo uploaded" });
    const products = await allProducts();
    const r = await identifyProduct(files[0], products);
    const match = products.find((p) => p.id === r.product_id) ?? null;
    return { product: match, confidence: r.confidence, reason: r.reason };
  });

  // Step 3: compare invoice and scans. Idempotent.
  app.post("/api/deliveries/:id/reconcile", async (req) => {
    const id = Number((req.params as any).id);
    const lines = await query(
      "SELECT id, product_id, raw_text, qty::float AS qty FROM invoice_lines WHERE delivery_id = $1",
      [id],
    );
    const scans = await query(
      "SELECT product_id, qty::float AS qty FROM scans WHERE delivery_id = $1",
      [id],
    );
    const products = await allProducts();
    const names = new Map(products.map((p) => [p.id, p.name]));
    const findings = reconcile(lines, scans, names);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM findings WHERE delivery_id = $1", [id]);
      for (const f of findings) {
        await client.query(
          `INSERT INTO findings (delivery_id, invoice_line_id, product_id, type, expected_qty, received_qty, detail)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [id, f.invoice_line_id, f.product_id, f.type, f.expected_qty, f.received_qty, f.detail],
        );
      }
      await client.query(
        `UPDATE issues i SET finding_id = f.id
           FROM findings f
          WHERE i.delivery_id = $1 AND f.delivery_id = $1 AND f.product_id = i.product_id`,
        [id],
      );
      await client.query("UPDATE deliveries SET status = 'reconciled' WHERE id = $1 AND status <> 'closed'", [id]);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
    return query("SELECT * FROM findings WHERE delivery_id = $1 ORDER BY id", [id]);
  });

  // Step 4: a human report on any product, with optional photos.
  app.post("/api/deliveries/:id/issues", async (req, reply) => {
    const id = Number((req.params as any).id);
    const { fields, files } = await readMultipart(req);
    const productId = Number(fields.product_id);
    const types = ["short", "expired", "damaged", "wrong_item", "other"];
    if (!productId || !types.includes(fields.type)) {
      return reply.code(400).send({ error: "product_id and a valid type are required" });
    }
    const [issue] = await query<{ id: number }>(
      `INSERT INTO issues (delivery_id, product_id, finding_id, type, qty, expiry_date, note, voice_transcript)
       VALUES ($1, $2,
               (SELECT id FROM findings WHERE delivery_id = $1 AND product_id = $2 LIMIT 1),
               $3, $4, $5, $6, $7) RETURNING *`,
      [
        id,
        productId,
        fields.type,
        Number(fields.qty) || 1,
        fields.expiry_date || null,
        fields.note || null,
        fields.voice_transcript || null,
      ],
    );
    for (const f of files) {
      const key = await uploadPhoto(`issues/${id}`, f.data, f.contentType);
      await query("INSERT INTO issue_photos (issue_id, r2_key) VALUES ($1, $2)", [issue.id, key]);
    }
    return issue;
  });

  app.delete("/api/issues/:id", async (req) => {
    await query("DELETE FROM issues WHERE id = $1", [Number((req.params as any).id)]);
    return { ok: true };
  });

  // Step 5: confirm. Writes stock, drafts the supplier report, closes the delivery.
  app.post("/api/deliveries/:id/finish", async (req, reply) => {
    const id = Number((req.params as any).id);
    const delivery = await getDelivery(id);
    if (!delivery) return reply.code(404).send({ error: "Delivery not found" });
    if (delivery.status === "closed") {
      const [existing] = await query("SELECT * FROM reports WHERE delivery_id = $1 ORDER BY id DESC LIMIT 1", [id]);
      return existing;
    }

    const scans = await query(
      "SELECT product_id, qty::float AS qty FROM scans WHERE delivery_id = $1",
      [id],
    );
    const issues = await query(
      `SELECT i.*, p.name AS product_name, i.qty::float AS qty FROM issues i
         JOIN products p ON p.id = i.product_id WHERE i.delivery_id = $1 ORDER BY i.id`,
      [id],
    );
    const findings = await query(
      `SELECT f.*, f.expected_qty::float AS expected_qty, f.received_qty::float AS received_qty
         FROM findings f WHERE f.delivery_id = $1 ORDER BY f.id`,
      [id],
    );

    // Findings not already covered by a human issue still go on the report.
    const coveredProducts = new Set(issues.map((i) => i.product_id));
    const items: string[] = [
      ...findings
        .filter((f) => f.product_id == null || !coveredProducts.has(f.product_id))
        .map((f) => f.detail as string),
      ...issues.map((i) => {
        const bits = [`${i.product_name}: ${i.type.replace("_", " ")}, qty ${i.qty}`];
        if (i.expiry_date) bits.push(`expiry ${i.expiry_date}`);
        if (i.note) bits.push(i.note);
        return bits.join(", ");
      }),
    ];

    // Write to the supplier in the invoice language (Cyrillic invoice -> Bulgarian).
    const [{ raw }] = await query<{ raw: string }>(
      "SELECT COALESCE(string_agg(raw_text, ' '), '') AS raw FROM invoice_lines WHERE delivery_id = $1",
      [id],
    );
    const language = /[Ѐ-ӿ]/.test(raw) ? "bg" : "en";

    let message = "";
    let resolution = "Please issue a credit note or send a replacement for the items above.";
    if (items.length) {
      try {
        const draft = await draftSupplierMessage({
          language,
          supplier: delivery.supplier_name ?? "Supplier",
          invoiceNumber: delivery.invoice_number,
          items,
        });
        message = draft.message;
        resolution = draft.requested_resolution;
      } catch (e) {
        req.log.warn(e, "AI draft failed, using template");
      }
      if (!message) {
        message = `Hello, we received the delivery for invoice ${delivery.invoice_number ?? "n/a"} and found the problems listed below.`;
      }
    } else {
      message = "No problems found with this delivery.";
      resolution = "";
    }
    const body = [message, "", ...items.map((t, n) => `${n + 1}. ${t}`)].join("\n");

    const split = stockSplit(scans, issues);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM stock_movements WHERE delivery_id = $1", [id]);
      for (const s of split) {
        if (s.sellable > 0) {
          await client.query(
            "INSERT INTO stock_movements (delivery_id, product_id, qty, bucket) VALUES ($1, $2, $3, 'sellable')",
            [id, s.product_id, s.sellable],
          );
        }
        if (s.quarantine > 0) {
          await client.query(
            "INSERT INTO stock_movements (delivery_id, product_id, qty, bucket) VALUES ($1, $2, $3, 'quarantine')",
            [id, s.product_id, s.quarantine],
          );
        }
      }
      const { rows } = await client.query(
        "INSERT INTO reports (delivery_id, body, requested_resolution) VALUES ($1, $2, $3) RETURNING *",
        [id, body, resolution],
      );
      await client.query("UPDATE deliveries SET status = 'closed', closed_at = now() WHERE id = $1", [id]);
      await client.query("COMMIT");
      return rows[0];
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  });

  // Printable report for the deliverer.
  app.get("/api/deliveries/:id/report.html", async (req, reply) => {
    const id = Number((req.params as any).id);
    const delivery = await getDelivery(id);
    const [report] = await query("SELECT * FROM reports WHERE delivery_id = $1 ORDER BY id DESC LIMIT 1", [id]);
    if (!delivery || !report) return reply.code(404).send({ error: "No report yet" });
    const photoRows = await query(
      `SELECT ph.r2_key FROM issue_photos ph
         JOIN issues i ON i.id = ph.issue_id WHERE i.delivery_id = $1`,
      [id],
    );
    const photos = await Promise.all(
      photoRows.map(async (p) => ({ url: await photoUrl(p.r2_key) })),
    );
    return reply.type("text/html").send(renderReportHtml({ delivery, report, photos }));
  });
}
