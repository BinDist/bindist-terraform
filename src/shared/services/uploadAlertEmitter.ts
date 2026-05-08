/**
 * Upload Alert Emitter
 *
 * Publishes an "IP_CHANGE_ALERT" message to the upload-alerts SQS queue
 * when an upload is recorded from an IP address that differs from the
 * previous upload on the same tenant. The downstream worker
 * (src/functions/uploadAlertWorker on AWS, cron-worker on Scaleway)
 * is responsible for tenant lookup, opt-out handling, cooldown and
 * actually sending the email.
 *
 * Design notes:
 * - Fire-and-forget from the caller's perspective: this function never
 *   throws. A failure to enqueue must never fail the upload itself.
 * - No-op if UPLOAD_ALERT_QUEUE_URL is not configured (e.g. local dev,
 *   older deployments before this feature rolled out).
 * - The AWS SQS SDK is reused here because on Scaleway it is already
 *   configured to target MNQ SQS via endpoint override.
 */

import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { Upload } from '../types/entities.js';

export interface IpChangeAlertMessage {
  /** Dispatch action for both AWS worker and Scaleway cron worker */
  action: 'IP_CHANGE_ALERT';
  /** Tenant whose admin should be notified */
  tenantId: string;
  /** Upload metadata at the time the IP change was detected */
  upload: {
    applicationId: string;
    version: string;
    fileName: string;
    fileSize: number;
    clientIp: string;
    previousIp?: string;
    userAgent?: string;
    uploadedAt: string;
    uploadMethod: 'direct' | 'large';
  };
}

let _sqsClient: SQSClient | null = null;

function getClient(): SQSClient {
  if (!_sqsClient) {
    const endpoint = process.env.MNQ_SQS_ENDPOINT;
    const region = process.env.MNQ_SQS_REGION || process.env.AWS_REGION;
    // On Scaleway MNQ the function's default AWS_ACCESS_KEY_ID is the
    // Object Storage credential and is NOT valid for SQS — pass the
    // MNQ-specific credentials explicitly when present.
    const mnqAccessKey = process.env.MNQ_SQS_ACCESS_KEY;
    const mnqSecretKey = process.env.MNQ_SQS_SECRET_KEY;
    _sqsClient = new SQSClient({
      ...(endpoint ? { endpoint } : {}),
      ...(region ? { region } : {}),
      ...(mnqAccessKey && mnqSecretKey
        ? { credentials: { accessKeyId: mnqAccessKey, secretAccessKey: mnqSecretKey } }
        : {}),
    });
  }
  return _sqsClient;
}

/**
 * Emit an IP-change alert message. Never throws.
 */
export async function emitIpChangeAlert(
  tenantId: string,
  upload: Upload
): Promise<void> {
  const queueUrl = process.env.UPLOAD_ALERT_QUEUE_URL;
  if (!queueUrl) {
    return;
  }

  const message: IpChangeAlertMessage = {
    action: 'IP_CHANGE_ALERT',
    tenantId,
    upload: {
      applicationId: upload.applicationId,
      version: upload.version,
      fileName: upload.fileName,
      fileSize: upload.fileSize,
      clientIp: upload.clientIp,
      previousIp: upload.previousIp,
      userAgent: upload.userAgent,
      uploadedAt: upload.uploadedAt,
      uploadMethod: upload.uploadMethod,
    },
  };

  try {
    await getClient().send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(message),
      })
    );
  } catch (err) {
    console.error('Failed to emit IP change alert:', err);
  }
}
