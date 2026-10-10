import type { IdentifyResult, Product } from "@stockin/shared";
import { callJson } from "../claude/callJson.js";
import { catalogueText, imageBlock, type ImageInput } from "../claude/content.js";

export async function identifyProduct(
  image: ImageInput,
  products: Product[],
): Promise<IdentifyResult> {
  return callJson<IdentifyResult>({
    system:
      "You identify a grocery product from a photo by matching it to the shop catalogue. " +
      "If it is not clearly one catalogue product, return null. Never guess.",
    content: [
      imageBlock(image),
      { type: "text", text: `Catalogue (id: name):\n${catalogueText(products)}\n\nWhich product is in the photo?` },
    ],
    schema: {
      type: "object",
      properties: {
        product_id: { type: ["integer", "null"] },
        confidence: { type: "number" },
        reason: { type: "string" },
      },
      required: ["product_id", "confidence", "reason"],
    },
    maxTokens: 512,
  });
}
