import type { DraftMessageRequest, DraftMessageResponse } from "@stockin/shared";
import { callJson } from "../claude/callJson.js";

export async function draftSupplierMessage(
  input: DraftMessageRequest,
): Promise<DraftMessageResponse> {
  return callJson<DraftMessageResponse>({
    system:
      "You write short, polite, factual messages from a small shop to a supplier about problems with a delivery. " +
      "Do not invent facts or quantities; use only the items given. No threats. " +
      "Always write in English, even if item text or product names are Bulgarian; keep product names as given.",
    content: [
      {
        type: "text",
        text:
          "Write the cover message in English.\n" +
          `Supplier: ${input.supplier}\nInvoice: ${input.invoiceNumber ?? "n/a"}\nReported items:\n` +
          input.items.map((i) => `- ${i}`).join("\n") +
          "\n\nDo not ask for a credit, replacement or any other resolution; the shop states that separately.",
      },
    ],
    schema: {
      type: "object",
      properties: {
        message: { type: "string" },
      },
      required: ["message"],
    },
    maxTokens: 1024,
  });
}
