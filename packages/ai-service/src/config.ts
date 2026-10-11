import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });

// CLAUDE_MODEL forces one model for every capability (cheap testing); the per-capability
// variables win over it, and the defaults are what the finished product uses.
const modelOverride = process.env.CLAUDE_MODEL || "";

export const config = {
  port: Number(process.env.PORT ?? 3002),
  models: {
    extractInvoice: process.env.CLAUDE_MODEL_EXTRACT_INVOICE || modelOverride || "claude-opus-5-5",
    identifyProduct: process.env.CLAUDE_MODEL_IDENTIFY_PRODUCT || modelOverride || "claude-sonnet-5-5",
    draftMessage: process.env.CLAUDE_MODEL_DRAFT_MESSAGE || modelOverride || "claude-haiku-5-5",
  },
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? "",
  // Only needed when the key is not scoped to a single workspace.
  anthropicWorkspaceId: process.env.ANTHROPIC_WORKSPACE_ID ?? "",
  // When set, every request except /health must send it.
  serviceToken: process.env.AI_SERVICE_TOKEN ?? "",
};
