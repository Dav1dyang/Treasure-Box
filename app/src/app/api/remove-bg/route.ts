import { NextRequest, NextResponse } from 'next/server';

// WASM bg removal can be slow on cold start (model download ~30MB)
export const maxDuration = 60;

/**
 * Background removal using @imgly/background-removal-node (runs server-side WASM).
 * Falls back to returning original image if removal fails.
 * Also calls Google Vision API for object contour data (physics shapes).
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('image') as File;
    if (!file) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let resultBuffer: Buffer = buffer;
    let contourPoints: { x: number; y: number }[] | null = null;
    let bgRemoved = false;

    // 1. Try background removal with @imgly/background-removal-node
    try {
      const { removeBackground } = await import('@imgly/background-removal-node');
      const blob = new Blob([buffer], { type: file.type });
      const resultBlob = await removeBackground(blob, {
        model: 'small',
        output: { format: 'image/png' },
      });
      resultBuffer = Buffer.from(await resultBlob.arrayBuffer());
      bgRemoved = true;
    } catch (e) {
      console.warn('Background removal failed, using original:', e);
    }

    // 2. Try Google Vision API for object contour (used for physics shape)
    const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
    if (apiKey) {
      try {
        const base64 = buffer.toString('base64');
        const visionResponse = await fetch(
          `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              requests: [{
                image: { content: base64 },
                features: [
                  { type: 'OBJECT_LOCALIZATION', maxResults: 1 },
                ],
              }],
            }),
          }
        );

        if (visionResponse.ok) {
          const visionData = await visionResponse.json();
          const objects = visionData.responses?.[0]?.localizedObjectAnnotations;
          if (objects?.length > 0) {
            contourPoints = objects[0].boundingPoly.normalizedVertices;
          }
        }
      } catch (e) {
        console.warn('Vision API failed:', e);
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'image/png',
      'X-Bg-Removed': bgRemoved ? 'true' : 'false',
    };
    if (contourPoints) {
      headers['X-Object-Vertices'] = JSON.stringify(contourPoints);
    }

    return new NextResponse(new Uint8Array(resultBuffer), { headers });
  } catch (error) {
    console.error('Background removal error:', error);
    return NextResponse.json(
      { error: 'Background removal failed' },
      { status: 500 }
    );
  }
}
