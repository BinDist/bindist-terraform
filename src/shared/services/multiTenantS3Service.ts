/**
 * Multi-Tenant S3 service for binary storage operations
 * All functions take bucketName as the first parameter
 */

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CreateMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  PRESIGNED_URL_EXPIRY_SECONDS,
  calculateExpiryDate,
} from '../config/constants.js';
import { sanitizeFileName } from '../utils/validation.js';

const client = new S3Client({});

/**
 * Get the S3 key for an application file
 */
function getFileKey(
  applicationId: string,
  version: string,
  fileName: string,
  fileId?: string
): string {
  if (fileId) {
    return `${applicationId}/${version}/${fileId}_${fileName}`;
  }
  return `${applicationId}/${version}/${fileName}`;
}

/**
 * Generate a pre-signed URL for downloading a file
 */
export async function getDownloadUrl(
  bucketName: string,
  applicationId: string,
  version: string,
  fileName: string,
  fileId?: string
): Promise<{ url: string; expiresAt: Date }> {
  const key = getFileKey(applicationId, version, fileName, fileId);

  // Sanitize filename for Content-Disposition header (defense-in-depth)
  const safeFileName = sanitizeFileName(fileName);

  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
    ResponseContentDisposition: `attachment; filename="${safeFileName}"`,
  });

  const url = await getSignedUrl(client, command, { expiresIn: PRESIGNED_URL_EXPIRY_SECONDS });
  const expiresAt = calculateExpiryDate(PRESIGNED_URL_EXPIRY_SECONDS);

  return { url, expiresAt };
}

/**
 * Generate a pre-signed URL for uploading a file
 */
export async function getUploadUrl(
  bucketName: string,
  applicationId: string,
  version: string,
  fileName: string,
  contentType: string = 'application/octet-stream',
  fileId?: string
): Promise<{ url: string; expiresAt: Date }> {
  const key = getFileKey(applicationId, version, fileName, fileId);

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: contentType,
  });

  const url = await getSignedUrl(client, command, { expiresIn: PRESIGNED_URL_EXPIRY_SECONDS });
  const expiresAt = calculateExpiryDate(PRESIGNED_URL_EXPIRY_SECONDS);

  return { url, expiresAt };
}

/**
 * Upload a file directly to S3
 */
export async function uploadFile(
  bucketName: string,
  applicationId: string,
  version: string,
  fileName: string,
  body: Buffer | Uint8Array,
  contentType: string = 'application/octet-stream',
  fileId?: string
): Promise<void> {
  const key = getFileKey(applicationId, version, fileName, fileId);

  await client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

/**
 * Check if a file exists in S3
 */
export async function fileExists(
  bucketName: string,
  applicationId: string,
  version: string,
  fileName: string,
  fileId?: string
): Promise<boolean> {
  const key = getFileKey(applicationId, version, fileName, fileId);

  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: bucketName,
        Key: key,
      })
    );
    return true;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'name' in error && error.name === 'NotFound') {
      return false;
    }
    throw error;
  }
}

/**
 * Get file metadata from S3
 */
export async function getFileMetadata(
  bucketName: string,
  applicationId: string,
  version: string,
  fileName: string,
  fileId?: string
): Promise<{ contentLength: number; contentType: string; etag: string } | null> {
  const key = getFileKey(applicationId, version, fileName, fileId);

  try {
    const result = await client.send(
      new HeadObjectCommand({
        Bucket: bucketName,
        Key: key,
      })
    );

    return {
      contentLength: result.ContentLength || 0,
      contentType: result.ContentType || 'application/octet-stream',
      etag: result.ETag || '',
    };
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'name' in error && error.name === 'NotFound') {
      return null;
    }
    throw error;
  }
}

/**
 * Delete a file from S3
 */
export async function deleteFile(
  bucketName: string,
  applicationId: string,
  version: string,
  fileName: string,
  fileId?: string
): Promise<void> {
  const key = getFileKey(applicationId, version, fileName, fileId);

  await client.send(
    new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    })
  );
}

/**
 * Initialize a multipart upload for large files
 */
export async function initializeMultipartUpload(
  bucketName: string,
  applicationId: string,
  version: string,
  fileName: string,
  contentType: string = 'application/octet-stream',
  fileId?: string
): Promise<string> {
  const key = getFileKey(applicationId, version, fileName, fileId);

  const result = await client.send(
    new CreateMultipartUploadCommand({
      Bucket: bucketName,
      Key: key,
      ContentType: contentType,
    })
  );

  return result.UploadId || '';
}

/**
 * Get signed URL for uploading a part in multipart upload
 */
export async function getUploadPartUrl(
  bucketName: string,
  applicationId: string,
  version: string,
  fileName: string,
  uploadId: string,
  partNumber: number,
  fileId?: string
): Promise<string> {
  const key = getFileKey(applicationId, version, fileName, fileId);

  const command = new UploadPartCommand({
    Bucket: bucketName,
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
  });

  return getSignedUrl(client, command, { expiresIn: PRESIGNED_URL_EXPIRY_SECONDS });
}

/**
 * Complete a multipart upload
 */
export async function completeMultipartUpload(
  bucketName: string,
  applicationId: string,
  version: string,
  fileName: string,
  uploadId: string,
  parts: Array<{ ETag: string; PartNumber: number }>,
  fileId?: string
): Promise<void> {
  const key = getFileKey(applicationId, version, fileName, fileId);

  await client.send(
    new CompleteMultipartUploadCommand({
      Bucket: bucketName,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts },
    })
  );
}
