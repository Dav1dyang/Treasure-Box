import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { GoogleAuth } from 'google-auth-library';
import { extractContourFromBuffer } from '@/lib/contourServer';

// Vertex AI segmentation can take a while for large images
export const maxDuration = 60;

/**
 * Background removal using Vertex AI Image Segmentation.
 * Returns JSON with base64 PNG (alpha channel applied), contour points, and status.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('image') as File;
    if (!file) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let buffer: any = Buffer.from(await file.arrayBuffer());
    let bgRemoved = false;
    let contourPoints: { x: number; y: number }[] | null = null;
    let error: string | null = null;

    const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
    const region = process.env.GOOGLE_CLOUD_REGION || 'us-central1';

    if (!projectId) {
      return NextResponse.json({
        image: buffer.toString('base64'),
        contentType: file.type || 'image/png',
        bgRemoved: false,
        contourPoints: null,
        error: 'GOOGLE_CLOUD_PROJECT_ID not configured — background removal unavailable',
      });
    }

    try {
      // Resize large images before sending to Vertex AI (cap at 2048px longest edge)
      const metadata = await sharp(buffer).metadata();
      const maxDim = Math.max(metadata.width || 0, metadata.height || 0);
      if (maxDim > 2048) {
        buffer = await sharp(buffer)
          .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
          .toBuffer();
      }

      // Authenticate with Vertex AI
      const serviceAccountKey = process.env.GOOGLE_CLOUD_SERVICE_ACCOUNT_KEY;
      let auth: GoogleAuth;
      if (serviceAccountKey) {
        const credentials = JSON.parse(
          Buffer.from(serviceAccountKey, 'base64').toString('utf-8')
        );
        auth = new GoogleAuth({
          credentials,
          scopes: ['https://www.googleapis.com/auth/cloud-platform'],
        });
      } else {
        // Fall back to Application Default Credentials
        auth = new GoogleAuth({
          scopes: ['https://www.googleapis.com/auth/cloud-platform'],
        });
      }

      const client = await auth.getClient();
      const accessToken = await client.getAccessToken();

      // Call Vertex AI Image Segmentation
      const endpoint = `https://${region}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${region}/publishers/google/models/image-segmentation-001:predict`;
      const base64Image = buffer.toString('base64');

      const vertexRes = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instances: [{ image: { bytesBase64Encoded: base64Image } }],
          parameters: { mode: 'foreground' },
        }),
      });

      if (!vertexRes.ok) {
        const errText = await vertexRes.text();
        throw new Error(`Vertex AI returned ${vertexRes.status}: ${errText}`);
      }

      const vertexData = await vertexRes.json();
      const maskBase64 = vertexData.predictions?.[0]?.bytesBase64Encoded;
      if (!maskBase64) {
        throw new Error('No mask returned from Vertex AI');
      }

      // Get original image as raw RGBA
      const originalSharp = sharp(buffer).ensureAlpha();
      const { data: originalRaw, info } = await originalSharp
        .raw()
        .toBuffer({ resolveWithObject: true });

      // Resize mask to match original dimensions, convert to single-channel grayscale
      const maskBuffer = Buffer.from(maskBase64, 'base64');
      const maskRaw = await sharp(maskBuffer)
        .resize(info.width, info.height, { fit: 'fill' })
        .grayscale()
        .raw()
        .toBuffer();

      // Apply mask as alpha channel
      const pixels = Buffer.from(originalRaw);
      for (let i = 0; i < info.width * info.height; i++) {
        pixels[i * 4 + 3] = maskRaw[i];
      }

      // Encode result as PNG
      const resultBuffer = await sharp(pixels, {
        raw: { width: info.width, height: info.height, channels: 4 },
      }).png().toBuffer();

      // Extract contour points server-side
      contourPoints = extractContourFromBuffer(pixels, info.width, info.height);
      bgRemoved = true;

      return NextResponse.json({
        image: resultBuffer.toString('base64'),
        contentType: 'image/png',
        bgRemoved: true,
        contourPoints,
        error: null,
      });
    } catch (e) {
      console.error('Vertex AI segmentation failed:', e);
      error = e instanceof Error ? e.message : 'Background removal failed';
    }

    // Fallback: return original image as PNG
    const fallbackBuffer = await sharp(buffer).png().toBuffer();
    return NextResponse.json({
      image: fallbackBuffer.toString('base64'),
      contentType: 'image/png',
      bgRemoved: false,
      contourPoints: null,
      error,
    });
  } catch (err) {
    console.error('Background removal error:', err);
    return NextResponse.json(
      { error: 'Background removal failed' },
      { status: 500 }
    );
  }
}
