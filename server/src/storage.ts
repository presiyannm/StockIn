import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "./config.js";

const { accountId, accessKeyId, secretAccessKey, bucket } = config.r2;

/** R2 is used when all four values are set; otherwise photos go to ./uploads. */
export const usingR2 = Boolean(
  accountId && accessKeyId && secretAccessKey && bucket,
);

export const localDir = path.resolve(process.cwd(), "uploads");

const s3 = usingR2
  ? new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    })
  : null;

const mimeByExt: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

/** Saves a photo and returns its object key (what the DB stores). */
export async function uploadPhoto(
  prefix: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  const sub = contentType.split("/")[1] ?? "jpeg";
  const ext = sub === "jpeg" ? "jpg" : sub;
  const key = `${prefix}/${randomUUID()}.${ext}`;
  if (s3) {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  } else {
    const file = path.join(localDir, key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
  }
  return key;
}

/** URL the phone can use to display a stored photo. */
export async function photoUrl(key: string): Promise<string> {
  if (s3) {
    return getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: 3600 },
    );
  }
  return `/api/files/${key}`;
}

export async function downloadPhoto(
  key: string,
): Promise<{ data: Buffer; contentType: string }> {
  if (s3) {
    const res = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    return {
      data: Buffer.from(await res.Body!.transformToByteArray()),
      contentType: res.ContentType ?? "image/jpeg",
    };
  }
  const file = path.resolve(localDir, key);
  if (!file.startsWith(localDir + path.sep)) throw new Error("Bad key");
  const ext = path.extname(file).slice(1).toLowerCase();
  return {
    data: await readFile(file),
    contentType: mimeByExt[ext] ?? "application/octet-stream",
  };
}
