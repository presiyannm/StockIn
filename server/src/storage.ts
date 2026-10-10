import { randomUUID } from "node:crypto";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "./config.js";

const { accountId, accessKeyId, secretAccessKey, bucket } = config.r2;

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});

/** Uploads a photo to R2 and returns its object key (what the DB stores). */
export async function uploadPhoto(
  prefix: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  const ext = contentType.split("/")[1] ?? "jpg";
  const key = `${prefix}/${randomUUID()}.${ext}`;
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return key;
}

/** Short-lived URL so the phone can display a private R2 object. */
export function photoUrl(key: string): Promise<string> {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: 3600,
  });
}

export async function downloadPhoto(
  key: string,
): Promise<{ data: Buffer; contentType: string }> {
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return {
    data: Buffer.from(await res.Body!.transformToByteArray()),
    contentType: res.ContentType ?? "image/jpeg",
  };
}
