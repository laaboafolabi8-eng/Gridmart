import type { Express } from "express";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { getObjectAclPolicy } from "./objectAcl";
import sharp from "sharp";

const CONVERTIBLE_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/tiff', 'image/bmp', 'image/gif'
]);

const MAX_CONVERT_SIZE = 10 * 1024 * 1024; // 10MB max for conversion

function detectContentType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop() || '';
  const mimeTypes: Record<string, string> = {
    'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
    'gif': 'image/gif', 'webp': 'image/webp', 'avif': 'image/avif',
    'svg': 'image/svg+xml', 'bmp': 'image/bmp', 'tiff': 'image/tiff',
    'tif': 'image/tiff', 'heic': 'image/heic',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

function isConvertibleImage(contentType: string, filename: string): boolean {
  if (CONVERTIBLE_TYPES.has(contentType)) return true;
  const detected = detectContentType(filename);
  return CONVERTIBLE_TYPES.has(detected);
}

export function registerObjectStorageRoutes(app: Express): void {
  const objectStorageService = new ObjectStorageService();

  app.post("/api/uploads/request-url", async (req, res) => {
    try {
      const { name, size, contentType } = req.body;

      if (!name) {
        return res.status(400).json({
          error: "Missing required field: name",
        });
      }

      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

      res.json({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      });
    } catch (error) {
      console.error("Error generating upload URL:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  async function serveWithWebP(req: any, res: any, objectPath: string) {
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
      const acceptsWebP = req.headers.accept?.includes('image/webp');

      if (!acceptsWebP) {
        return await objectStorageService.downloadObject(objectFile, res);
      }

      const [metadata] = await objectFile.getMetadata();
      let contentType = metadata.contentType || detectContentType(objectFile.name);
      const fileSize = parseInt(metadata.size as string, 10) || 0;

      if (!isConvertibleImage(contentType, objectFile.name) || fileSize > MAX_CONVERT_SIZE) {
        return await objectStorageService.downloadObject(objectFile, res);
      }

      const aclPolicy = await getObjectAclPolicy(objectFile);
      const isPublic = aclPolicy?.visibility === "public";
      const cacheVisibility = isPublic ? "public" : "private";

      const etag = metadata.etag || metadata.generation || '';
      const etagHash = etag ? `-${Buffer.from(String(etag)).toString('base64url').slice(0, 8)}` : '';
      const webpCachePath = objectFile.name + etagHash + '.webp';
      const bucket = objectFile.bucket;
      const cachedWebP = bucket.file(webpCachePath);
      const [cacheExists] = await cachedWebP.exists();

      if (cacheExists) {
        const [cachedMeta] = await cachedWebP.getMetadata();
        res.set({
          "Content-Type": "image/webp",
          "Content-Length": cachedMeta.size,
          "Cache-Control": `${cacheVisibility}, max-age=31536000, immutable`,
          "Vary": "Accept",
        });
        const stream = cachedWebP.createReadStream();
        stream.on("error", (err: Error) => {
          console.error("WebP cache stream error:", err);
          if (!res.headersSent) {
            res.status(500).json({ error: "Error streaming file" });
          }
        });
        stream.pipe(res);
        return;
      }

      const transformer = sharp().webp({ quality: 80 });
      const chunks: Buffer[] = [];

      transformer.on('data', (chunk: Buffer) => chunks.push(chunk));
      transformer.on('error', (err: Error) => {
        console.error("Sharp conversion error:", err);
        if (!res.headersSent) {
          objectStorageService.downloadObject(objectFile, res);
        }
      });

      const readStream = objectFile.createReadStream();
      readStream.on('error', (err: Error) => {
        console.error("Read stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error reading file" });
        }
      });

      const webpBuffer = await new Promise<Buffer>((resolve, reject) => {
        const bufs: Buffer[] = [];
        const transform = sharp().webp({ quality: 80 });
        transform.on('data', (chunk: Buffer) => bufs.push(chunk));
        transform.on('end', () => resolve(Buffer.concat(bufs)));
        transform.on('error', reject);
        readStream.on('error', reject);
        readStream.pipe(transform);
      });

      cachedWebP.save(webpBuffer, {
        metadata: { contentType: 'image/webp' },
      }).catch((err: Error) => {
        console.error("Failed to cache WebP version:", err);
      });

      res.set({
        "Content-Type": "image/webp",
        "Content-Length": webpBuffer.length.toString(),
        "Cache-Control": `${cacheVisibility}, max-age=31536000, immutable`,
        "Vary": "Accept",
      });
      res.send(webpBuffer);

    } catch (error) {
      console.error("Error serving object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "Object not found" });
      }
      return res.status(500).json({ error: "Failed to serve object" });
    }
  }

  app.get("/api/objects/*", async (req, res) => {
    const objectPath = req.path.replace('/api/objects/', '/objects/');
    await serveWithWebP(req, res, objectPath);
  });

  app.get("/objects/*", async (req, res) => {
    await serveWithWebP(req, res, req.path);
  });
}
