import { BadRequestException, Injectable } from '@nestjs/common';
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();

type ParsedObjectLocation = {
  bucket: string;
  key: string;
};

@Injectable()
export class StorageService {
  private s3Client?: S3Client;

  private getBucketName(): string {
    const bucket = process.env.R2_BUCKET_NAME || '';
    if (!bucket) {
      throw new BadRequestException('R2_BUCKET_NAME chưa được cấu hình');
    }
    return bucket;
  }

  private getEndpoint(): string {
    const accountId = process.env.R2_ACCOUNT_ID;
    if (!accountId) {
      throw new BadRequestException('R2_ACCOUNT_ID chưa được cấu hình');
    }

    return `https://${accountId}.r2.cloudflarestorage.com`;
  }

  private getClient(): S3Client {
    if (this.s3Client) return this.s3Client;

    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

    if (!accessKeyId || !secretAccessKey) {
      throw new BadRequestException('Thiếu R2_ACCESS_KEY_ID hoặc R2_SECRET_ACCESS_KEY');
    }

    this.s3Client = new S3Client({
      region: 'auto',
      endpoint: this.getEndpoint(),
      forcePathStyle: true,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    return this.s3Client;
  }

  private getFolderName(override?: string): string {
    return (override || '').replace(/^\/+|\/+$/g, '');
  }

  private buildKey(filename: string, folderName?: string): string {
    if (!filename) {
      throw new BadRequestException('Thiếu file để upload');
    }

    const normalizedFilename = filename.replace(/^\/+/, '');
    const folder = this.getFolderName(folderName);

    if (!folder) return normalizedFilename;
    if (normalizedFilename === folder || normalizedFilename.startsWith(`${folder}/`)) {
      return normalizedFilename;
    }

    return `${folder}/${normalizedFilename}`;
  }

  private getPublicBaseUrl(): string | null {
    return process.env.R2_PUBLIC_URL?.replace(/\/+$/, '') || null;
  }

  private getStableUrl(key: string): string {
    const publicBaseUrl = this.getPublicBaseUrl();
    if (publicBaseUrl) {
      return `${publicBaseUrl}/${this.encodeKey(key)}`;
    }

    return `r2://${this.getBucketName()}/${key}`;
  }

  private encodeKey(key: string): string {
    return key.split('/').map((part) => encodeURIComponent(part)).join('/');
  }

  async upload(buffer: Buffer, filename: string, contentType?: string, folderName?: string) {
    if (!buffer || !filename) {
      throw new BadRequestException('Thiếu file để upload');
    }

    const key = this.buildKey(filename, folderName);
    const detectedContentType = contentType || this.getContentTypeFromFilename(filename);
    const bucket = this.getBucketName();

    await this.getClient().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: detectedContentType,
      }),
    );

    const props = await this.getClient().send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );

    const stableUrl = this.getStableUrl(key);
    const signedUrl = await this.generateSignedUrl(bucket, key, undefined, 24);

    return {
      blobName: filename,
      key,
      url: stableUrl,
      sasUrl: signedUrl,
      contentType: props.ContentType || detectedContentType,
      contentLength: props.ContentLength ?? buffer.length,
      etag: props.ETag || null,
      lastModified: props.LastModified || null,
      container: folderName || this.getFolderName() || null,
      bucket,
    };
  }

  async getInfo(blobName: string, folderName?: string) {
    if (!blobName) {
      throw new BadRequestException('Thiếu blobName');
    }

    const bucket = this.getBucketName();
    const key = this.buildKey(blobName, folderName);

    let props;
    try {
      props = await this.getClient().send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
      );
    } catch (error) {
      throw new BadRequestException('Object không tồn tại trên R2');
    }

    const stableUrl = this.getStableUrl(key);
    const signedUrl = await this.generateSignedUrl(bucket, key, undefined, 24);

    return {
      blobName,
      key,
      url: stableUrl,
      sasUrl: signedUrl,
      contentType: props.ContentType || null,
      contentLength: props.ContentLength ?? null,
      etag: props.ETag || null,
      lastModified: props.LastModified || null,
      container: folderName || this.getFolderName() || null,
      bucket,
    };
  }

  /**
   * Generate signed URL tu URL co dinh dang luu trong DB.
   *
   * Tuong thich nguoc voi URL Azure cu:
   * https://<account>.blob.core.windows.net/<container>/<blob>
   * se duoc map sang key R2: <container>/<blob>.
   */
  async generateSasUrlFromUrl(blobUrl: string, fileType?: string, expiryHours?: number): Promise<string> {
    if (!blobUrl) {
      throw new BadRequestException('Thiếu URL file');
    }

    const location = this.parseObjectLocation(blobUrl);
    if (!location) {
      return blobUrl;
    }

    return this.generateSignedUrl(location.bucket, location.key, fileType, expiryHours);
  }

  private async generateSignedUrl(
    bucket: string,
    key: string,
    fileType?: string,
    expiryHours?: number,
  ): Promise<string> {
    const expiresIn = this.getExpirySeconds(fileType, expiryHours);

    return getSignedUrl(
      this.getClient(),
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
      { expiresIn },
    );
  }

  private parseObjectLocation(rawUrl: string): ParsedObjectLocation | null {
    const bucket = this.getBucketName();
    const trimmed = rawUrl.trim();

    if (!trimmed) return null;

    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
      return { bucket, key: trimmed.replace(/^\/+/, '') };
    }

    const url = new URL(trimmed);

    if (url.protocol === 'r2:') {
      const r2Bucket = url.hostname || bucket;
      const key = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
      return key ? { bucket: r2Bucket, key } : null;
    }

    if (!['http:', 'https:'].includes(url.protocol)) {
      return null;
    }

    const pathParts = url.pathname.split('/').filter(Boolean).map((part) => decodeURIComponent(part));
    if (pathParts.length === 0) return null;

    if (url.hostname.endsWith('.blob.core.windows.net')) {
      return { bucket, key: pathParts.join('/') };
    }

    const endpointHost = new URL(this.getEndpoint()).hostname;
    const publicBaseUrl = this.getPublicBaseUrl();
    const publicHost = publicBaseUrl ? new URL(publicBaseUrl).hostname : null;

    if (url.hostname === endpointHost) {
      if (pathParts[0] === bucket && pathParts.length > 1) {
        return { bucket, key: pathParts.slice(1).join('/') };
      }

      return { bucket, key: pathParts.join('/') };
    }

    if (publicBaseUrl && publicHost && url.hostname === publicHost) {
      const publicBasePathParts = new URL(publicBaseUrl).pathname
        .split('/')
        .filter(Boolean)
        .map((part) => decodeURIComponent(part));
      const keyParts = this.stripPrefix(pathParts, publicBasePathParts);
      return keyParts.length ? { bucket, key: keyParts.join('/') } : null;
    }

    return null;
  }

  private stripPrefix(parts: string[], prefix: string[]): string[] {
    if (prefix.length === 0) return parts;
    const hasPrefix = prefix.every((part, index) => parts[index] === part);
    return hasPrefix ? parts.slice(prefix.length) : parts;
  }

  /**
   * R2/S3 presigned URLs are safest within the SigV4 7-day limit.
   */
  private getExpirySeconds(fileType?: string, expiryHours?: number): number {
    const maxAge = 7 * 24 * 60 * 60;
    const requestedSeconds = expiryHours
      ? expiryHours * 60 * 60
      : Math.floor(this.getExpiryTimeByFileType(fileType) / 1000);

    return Math.max(1, Math.min(requestedSeconds, maxAge));
  }

  /**
   * Video: 3 giờ, Document: 1 giờ, Image: 30 phút, Audio: 2 giờ, Other: 1 giờ
   */
  private getExpiryTimeByFileType(fileType?: string): number {
    const HOUR = 60 * 60 * 1000;
    const MINUTE = 60 * 1000;

    switch (fileType?.toLowerCase()) {
      case 'video':
        return 3 * HOUR;
      case 'audio':
        return 2 * HOUR;
      case 'pdf':
      case 'document':
        return 1 * HOUR;
      case 'image':
        return 30 * MINUTE;
      default:
        return 1 * HOUR;
    }
  }

  private getContentTypeFromFilename(filename: string): string {
    const ext = path.extname(filename).toLowerCase();

    const mimeTypes: { [key: string]: string } = {
      '.mp4': 'video/mp4',
      '.avi': 'video/x-msvideo',
      '.mov': 'video/quicktime',
      '.wmv': 'video/x-ms-wmv',
      '.flv': 'video/x-flv',
      '.webm': 'video/webm',
      '.mkv': 'video/x-matroska',

      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
      '.aac': 'audio/aac',
      '.m4a': 'audio/mp4',

      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',

      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.txt': 'text/plain',
      '.rtf': 'application/rtf',

      '.zip': 'application/zip',
      '.rar': 'application/x-rar-compressed',
      '.7z': 'application/x-7z-compressed',
      '.tar': 'application/x-tar',
      '.gz': 'application/gzip',

      '.js': 'application/javascript',
      '.css': 'text/css',
      '.html': 'text/html',
      '.json': 'application/json',
      '.xml': 'application/xml',
    };

    return mimeTypes[ext] || 'application/octet-stream';
  }
}
