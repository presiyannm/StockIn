import {
  SERVICE_TOKEN_HEADER,
  type DraftMessageRequest,
  type DraftMessageResponse,
  type ExtractedInvoice,
  type IdentifyResult,
  type Product,
} from "@stockin/shared";
import { config } from "./config.js";

export type ImageInput = { data: Buffer; contentType: string };

/** The ai-service is down, misconfigured, or returned an error. */
export class AiServiceError extends Error {
  constructor(
    message: string,
    public status = 503,
  ) {
    super(message);
  }
}

const headers = (): Record<string, string> =>
  config.aiServiceToken ? { [SERVICE_TOKEN_HEADER]: config.aiServiceToken } : {};

async function call<T>(path: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${config.aiServiceUrl}${path}`, {
      ...init,
      headers: { ...headers(), ...init.headers },
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new AiServiceError(`ai-service is not reachable at ${config.aiServiceUrl}`);
  }
  const body = (await res.json().catch(() => null)) as any;
  if (!res.ok) {
    throw new AiServiceError(body?.error ?? body?.message ?? `ai-service error ${res.status}`, res.status === 401 ? 503 : res.status);
  }
  return body as T;
}

function form(images: ImageInput[], products: Product[]): FormData {
  const fd = new FormData();
  for (const [i, img] of images.entries()) {
    fd.append("image", new Blob([new Uint8Array(img.data)], { type: img.contentType }), `image-${i}`);
  }
  fd.append("products", JSON.stringify(products));
  return fd;
}

/** True when the ai-service is up and has an Anthropic key. */
export async function aiAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${config.aiServiceUrl}/health`, {
      signal: AbortSignal.timeout(3_000),
    });
    return res.ok && ((await res.json()) as { ai: boolean }).ai;
  } catch {
    return false;
  }
}

export const extractInvoice = (images: ImageInput[], products: Product[]) =>
  call<ExtractedInvoice>("/extract-invoice", { method: "POST", body: form(images, products) });

export const identifyProduct = (image: ImageInput, products: Product[]) =>
  call<IdentifyResult>("/identify-product", { method: "POST", body: form([image], products) });

export const draftSupplierMessage = (input: DraftMessageRequest) =>
  call<DraftMessageResponse>("/draft-message", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
