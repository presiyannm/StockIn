import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });

export const config = {
  port: Number(process.env.PORT ?? 3002),
  claudeModel: process.env.CLAUDE_MODEL ?? "claude-sonnet-5-5",
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? "",
  // Only needed when the key is not scoped to a single workspace.
  anthropicWorkspaceId: process.env.ANTHROPIC_WORKSPACE_ID ?? "",
  // When set, every request except /health must send it.
  serviceToken: process.env.AI_SERVICE_TOKEN ?? "",
};
