import type Anthropic from "@anthropic-ai/sdk";
import { requireClient } from "./client.js";
import { strictSchema, type Schema } from "./schema.js";

/** Asks for JSON matching the schema (structured outputs, no forced tool call). */
export async function callJson<T>(opts: {
  model: string;
  system: string;
  content: Anthropic.ContentBlockParam[];
  schema: Schema;
  maxTokens?: number;
}): Promise<T> {
  const res = await requireClient().messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 4096,
    system: opts.system,
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: strictSchema(opts.schema) },
    },
    messages: [{ role: "user", content: opts.content }],
  });
  if (res.stop_reason === "refusal") throw new Error("The model declined this request");
  if (res.stop_reason === "max_tokens") throw new Error("The model response was cut off");
  const block = res.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("Model returned no structured result");
  return JSON.parse(block.text) as T;
}
