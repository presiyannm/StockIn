import type { Product } from "@stockin/shared";

export type ImageInput = { data: Buffer; contentType: string };

type ImageMedia = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

export function imageBlock(img: ImageInput) {
  return {
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: img.contentType as ImageMedia,
      data: img.data.toString("base64"),
    },
  };
}

export function catalogueText(products: Product[]): string {
  return products
    .map(
      (p) =>
        `${p.id}: ${p.name}${p.barcode ? ` [barcode ${p.barcode}]` : ""}${
          p.aliases.length ? ` (also: ${p.aliases.join(", ")})` : ""
        }`,
    )
    .join("\n");
}
