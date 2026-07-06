import type { Express } from "express";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { getObjectAclPolicy } from "./objectAcl";
import sharp from "sharp";

const CONVERTIBLE_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/tiff', 'image/bmp', 'image/gif'
]);

const MAX_CONVERT_SIZE = 10 * 1024 * 1024; // 10MB max for conversion
const MAX_IMAGE_WIDTH = 1400; // default cap (2× retina)

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
      const requestedW = parseInt(req.query?.w || '0') || 0;
      const targetWidth = requestedW > 0 ? Math.min(requestedW, MAX_IMAGE_WIDTH) : MAX_IMAGE_WIDTH;
      const acceptsWebP = req.headers.accept?.includes('image/webp');

      const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
      const [metadata] = await objectFile.getMetadata();
      const contentType = metadata.contentType || detectContentType(objectFile.name);
      const fileSize = parseInt(metadata.size as string, 10) || 0;

      // Pass through files we can't convert (SVG, AVIF, HEIC, huge files)
      if (!isConvertibleImage(contentType, objectFile.name) || fileSize > MAX_CONVERT_SIZE) {
        return await objectStorageService.downloadObject(objectFile, res);
      }

      const aclPolicy = await getObjectAclPolicy(objectFile);
      const isPublic = aclPolicy?.visibility === "public";
      const cacheVisibility = isPublic ? "public" : "private";

      const outputMime = acceptsWebP ? 'image/webp' : contentType;
      const etag = metadata.etag || metadata.generation || '';
      const etagHash = etag ? `-${Buffer.from(String(etag)).toString('base64url').slice(0, 8)}` : '';
      const cacheSuffix = acceptsWebP ? `.v2.w${targetWidth}.webp` : `.v2.w${targetWidth}.orig`;
      const cachedPath = objectFile.name + etagHash + cacheSuffix;
      const bucket = objectFile.bucket;
      const cachedFile = bucket.file(cachedPath);
      const [cacheExists] = await cachedFile.exists();

      if (cacheExists) {
        const [cachedMeta] = await cachedFile.getMetadata();
        res.set({
          "Content-Type": outputMime,
          "Content-Length": cachedMeta.size,
          "Cache-Control": `${cacheVisibility}, max-age=31536000, immutable`,
          "Vary": "Accept",
        });
        const stream = cachedFile.createReadStream();
        stream.on("error", (err: Error) => {
          console.error("Cache stream error:", err);
          if (!res.headersSent) res.status(500).json({ error: "Error streaming file" });
        });
        stream.pipe(res);
        return;
      }

      // Convert: download full buffer, then resize + encode with sharp
      const [fileBytes] = await objectFile.download();
      let transformer = sharp(fileBytes).resize({ width: targetWidth, withoutEnlargement: true });
      if (acceptsWebP) transformer = transformer.webp({ quality: 60 });
      const outBuffer = await transformer.toBuffer();

      cachedFile.save(outBuffer, {
        metadata: { contentType: outputMime },
      }).catch((err: Error) => console.error("Failed to cache resized image:", err));

      res.set({
        "Content-Type": outputMime,
        "Content-Length": outBuffer.length.toString(),
        "Cache-Control": `${cacheVisibility}, max-age=31536000, immutable`,
        "Vary": "Accept",
      });
      res.send(outBuffer);

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
