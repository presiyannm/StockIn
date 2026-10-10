const esc = (s: unknown): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function renderReportHtml(input: {
  delivery: Record<string, any>;
  report: Record<string, any>;
  photos: { url: string }[];
}): string {
  const { delivery, report, photos } = input;
  const date = delivery.closed_at
    ? new Date(delivery.closed_at).toLocaleDateString("en-GB")
    : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Delivery report #${esc(delivery.id)}</title>
<style>
  body { font: 15px/1.5 system-ui, sans-serif; max-width: 720px; margin: 24px auto; padding: 0 16px; color: #111; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .meta { color: #555; margin-bottom: 16px; }
  pre { white-space: pre-wrap; font: inherit; background: #fafafa; border: 1px solid #ddd; padding: 12px; border-radius: 6px; }
  .photos img { width: 160px; height: 160px; object-fit: cover; border: 1px solid #ccc; margin: 0 8px 8px 0; }
  .sig { margin-top: 48px; border-top: 1px solid #000; width: 260px; padding-top: 4px; }
  button { padding: 8px 16px; margin-bottom: 16px; }
  @media print { button { display: none; } }
</style></head><body>
<button onclick="window.print()">Print</button>
<h1>Delivery report</h1>
<div class="meta">
  Supplier: <b>${esc(delivery.supplier_name ?? "-")}</b><br>
  Invoice: <b>${esc(delivery.invoice_number ?? "-")}</b><br>
  Received: ${esc(date)}
</div>
<pre>${esc(report.body)}</pre>
${report.requested_resolution ? `<p><b>Requested:</b> ${esc(report.requested_resolution)}</p>` : ""}
${photos.length ? `<h3>Photos</h3><div class="photos">${photos.map((p) => `<img src="${esc(p.url)}" alt="">`).join("")}</div>` : ""}
<div class="sig">Signed</div>
</body></html>`;
}
