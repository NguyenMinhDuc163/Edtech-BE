import { Injectable, BadRequestException } from '@nestjs/common';
import { BlobServiceClient, ContainerClient, generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential } from '@azure/storage-blob';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();

@Injectable()
export class StorageService {
  private getConnectionString(): string {
    const protocol = process.env.AZURE_PROTOCOL;
    const accountName = process.env.AZURE_ACCOUNT_NAME;
    const accountKey = process.env.AZURE_ACCOUNT_KEY;
    const endpointSuffix = process.env.AZURE_ENDPOINT_SUFFIX;

    if (!protocol || !accountName || !accountKey || !endpointSuffix) {
      throw new BadRequestException('Thiếu cấu hình Azure Blob trong biến môi trường');
    }

    return `DefaultEndpointsProtocol=${protocol};AccountName=${accountName};AccountKey=${accountKey};EndpointSuffix=${endpointSuffix}`;
  }

  private getContainerName(override?: string): string {
    return override || process.env.CONTAINER_NAME || '';
  }

  private async getContainerClient(containerName?: string): Promise<ContainerClient> {
    const name = this.getContainerName(containerName);
    if (!name) {
      throw new BadRequestException('CONTAINER_NAME chưa được cấu hình');
    }
    const connectionString = this.getConnectionString();
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient(name);
    const exists = await containerClient.exists();
    if (!exists) {
      await containerClient.create();
    }
    return containerClient;
  }

  async upload(buffer: Buffer, filename: string, contentType?: string, containerName?: string) {
    if (!buffer || !filename) {
      throw new BadRequestException('Thiếu file để upload');
    }

    
    const detectedContentType = this.getContentTypeFromFilename(filename);

    const containerClient = await this.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(filename);

    const uploadOptions: any = {
      blobHTTPHeaders: { blobContentType: detectedContentType }
    };
    await blockBlobClient.uploadData(buffer, uploadOptions);

    
    await blockBlobClient.setHTTPHeaders({ 
      blobContentType: detectedContentType 
    });

    const props = await blockBlobClient.getProperties();
    const sasUrl = await this.generateSasUrl(blockBlobClient, containerName);

    return {
      blobName: filename,
      url: blockBlobClient.url,
      sasUrl: sasUrl,
      contentType: detectedContentType, 
      contentLength: props.contentLength ?? buffer.length,
      etag: props.etag || null,
      lastModified: props.lastModified || null,
      container: containerClient.containerName,
    };
  }

  async getInfo(blobName: string, containerName?: string) {
    if (!blobName) {
      throw new BadRequestException('Thiếu blobName');
    }
    const containerClient = await this.getContainerClient(containerName);
    const client = containerClient.getBlockBlobClient(blobName);
    const exists = await client.exists();
    if (!exists) {
      throw new BadRequestException('Blob không tồn tại');
    }
    const props = await client.getProperties();
    const sasUrl = await this.generateSasUrl(client, containerName);
    
    return {
      blobName,
      url: client.url,
      sasUrl: sasUrl,
      contentType: props.contentType || null,
      contentLength: props.contentLength ?? null,
      etag: props.etag || null,
      lastModified: props.lastModified || null,
      container: containerClient.containerName,
    };
  }

  private async generateSasUrl(blockBlobClient: any, containerName?: string): Promise<string> {
    const accountName = process.env.AZURE_ACCOUNT_NAME;
    const accountKey = process.env.AZURE_ACCOUNT_KEY;
    
    if (!accountName || !accountKey) {
      throw new BadRequestException('Thiếu cấu hình Azure account name/key');
    }

    const container = this.getContainerName(containerName);
    const credential = new StorageSharedKeyCredential(accountName, accountKey);
    
    const sasOptions = {
      containerName: container,
      blobName: blockBlobClient.name,
      permissions: BlobSASPermissions.parse('r'), 
      startsOn: new Date(),
      expiresOn: new Date(new Date().valueOf() + 24 * 60 * 60 * 1000), 
    };

    const sasToken = generateBlobSASQueryParameters(sasOptions, credential).toString();
    return `${blockBlobClient.url}?${sasToken}`;
  }

  /**
   * Generate SAS URL từ blob URL cố định
   * @param blobUrl URL blob cố định (không có SAS token)
   * @param fileType Loại file để xác định thời hạn
   * @param expiryHours Thời hạn tùy chỉnh (giờ), nếu không truyền sẽ tự động theo fileType
   */
  async generateSasUrlFromUrl(blobUrl: string, fileType?: string, expiryHours?: number): Promise<string> {
    const accountName = process.env.AZURE_ACCOUNT_NAME;
    const accountKey = process.env.AZURE_ACCOUNT_KEY;

    if (!accountName || !accountKey) {
      throw new BadRequestException('Thiếu cấu hình Azure account name/key');
    }

    // Parse URL để lấy container và blob name
    const url = new URL(blobUrl);
    const pathParts = url.pathname.split('/').filter(p => p);
    if (pathParts.length < 2) {
      throw new BadRequestException('URL blob không hợp lệ');
    }

    const containerName = pathParts[0]!; // Non-null assertion vì đã check length
    const blobName = pathParts.slice(1).join('/');

    if (!containerName || !blobName) {
      throw new BadRequestException('Container hoặc blob name không hợp lệ');
    }

    // Xác định thời hạn dựa trên loại file
    let expiryTime: number;
    if (expiryHours) {
      expiryTime = expiryHours * 60 * 60 * 1000;
    } else {
      expiryTime = this.getExpiryTimeByFileType(fileType);
    }

    const credential = new StorageSharedKeyCredential(accountName, accountKey);

    const now = new Date();
    const startTime = new Date(now.valueOf() - 60 * 60 * 1000); // 1 giờ trước để tránh clock skew

    const sasOptions = {
      containerName: containerName,
      blobName: blobName,
      permissions: BlobSASPermissions.parse('r'), // Read only
      startsOn: startTime,
      expiresOn: new Date(now.valueOf() + expiryTime),
    };

    const sasToken = generateBlobSASQueryParameters(sasOptions, credential).toString();

    // Remove existing query params from URL and add SAS token
    const baseUrl = `${url.protocol}//${url.host}${url.pathname}`;
    return `${baseUrl}?${sasToken}`;
  }

  /**
   * Xác định thời hạn SAS dựa trên loại file
   * Video: 3 giờ, Document: 1 giờ, Image: 30 phút, Audio: 2 giờ, Other: 1 giờ
   */
  private getExpiryTimeByFileType(fileType?: string): number {
    const HOUR = 60 * 60 * 1000;
    const MINUTE = 60 * 1000;

    switch (fileType?.toLowerCase()) {
      case 'video':
        return 3 * HOUR; // 3 giờ cho video
      case 'audio':
        return 2 * HOUR; // 2 giờ cho audio
      case 'pdf':
      case 'document':
        return 1 * HOUR; // 1 giờ cho document
      case 'image':
        return 30 * MINUTE; // 30 phút cho image
      default:
        return 1 * HOUR; // Mặc định 1 giờ
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


