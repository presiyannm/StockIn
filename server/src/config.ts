import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

const required = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name} (see .env.example)`);
  return v;
};

export const config = {
  port: Number(process.env.PORT ?? 3001),
  databaseUrl: required("DATABASE_URL"),
  claudeModel: process.env.CLAUDE_MODEL ?? "claude-sonnet-5-5",
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? "",
  // Only needed when the key is not scoped to a single workspace.
  anthropicWorkspaceId: process.env.ANTHROPIC_WORKSPACE_ID ?? "",
  r2: {
    accountId: process.env.R2_ACCOUNT_ID ?? "",
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
    bucket: process.env.R2_BUCKET ?? "",
  },
};
