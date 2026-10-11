import type { IdentifyResult, Product } from "@stockin/shared";
import { callJson } from "../claude/callJson.js";
import { config } from "../config.js";
import { catalogueText, imageBlock, type ImageInput } from "../claude/content.js";

export async function identifyProduct(
  image: ImageInput,
  products: Product[],
): Promise<IdentifyResult> {
  return callJson<IdentifyResult>({
    model: config.models.identifyProduct,
    system:
      "You identify a grocery product from a photo by matching it to the shop catalogue. " +
      "If it is not clearly one catalogue product, return null. Never guess. " +
      "The shop worker reads `reason` to decide whether to count the item, so write it in plain English, 1-2 short sentences: " +
      "what you see (brand, product, size, pack/multipack, visible damage) and why it does or does not match.",
    content: [
      imageBlock(image),
      { type: "text", text: `Catalogue (id: name):\n${catalogueText(products)}\n\nWhich product is in the photo?` },
    ],
    schema: {
      type: "object",
      properties: {
        product_id: { type: ["integer", "null"] },
        confidence: { type: "number" },
        reason: { type: "string", description: "What is visible in the photo and why it matches or not" },
      },
      required: ["product_id", "confidence", "reason"],
    },
    maxTokens: 512,
  });
}
