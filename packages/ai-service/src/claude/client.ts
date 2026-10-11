import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";

export const aiEnabled = Boolean(config.anthropicKey);

const client = aiEnabled ? new Anthropic({
      apiKey: config.anthropicKey,
      defaultHeaders: config.anthropicWorkspaceId
        ? { "anthropic-workspace-id": config.anthropicWorkspaceId }
        : undefined,
    }) : null;

export function requireClient(): Anthropic {
  if (!client) throw new Error("ANTHROPIC_API_KEY is not set in .env");
  return client;
}
