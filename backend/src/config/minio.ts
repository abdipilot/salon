import { Client } from 'minio'
import { env } from './env.js'

export const minioClient = new Client({
  endPoint: env.MINIO_ENDPOINT,
  port: env.MINIO_PORT,
  useSSL: env.MINIO_USE_SSL,
  accessKey: env.MINIO_ACCESS_KEY,
  secretKey: env.MINIO_SECRET_KEY,
})

export async function ensureBucket() {
  try {
    const exists = await minioClient.bucketExists(env.MINIO_BUCKET)
    if (!exists) {
      await minioClient.makeBucket(env.MINIO_BUCKET, 'us-east-1')
      console.log(`MinIO bucket '${env.MINIO_BUCKET}' created`)
    }
  } catch (err) {
    console.error('MinIO bucket setup error:', err)
  }
}

export async function getSignedUrl(objectName: string, expiry = 900): Promise<string> {
  return minioClient.presignedGetObject(env.MINIO_BUCKET, objectName, expiry)
}

export async function uploadFile(
  objectName: string,
  buffer: Buffer,
  contentType: string
): Promise<void> {
  await minioClient.putObject(env.MINIO_BUCKET, objectName, buffer, buffer.length, {
    'Content-Type': contentType,
  })
}
