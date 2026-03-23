import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export const maxDuration = 30;

const PROMPT = `You are a furniture design expert. Generate exactly 5 unique drawer aesthetic styles AND 5 unique decorative features for a treasure box drawer.

RULES:
- Styles describe the overall aesthetic/period (single-select — user picks one)
- Features describe physical hardware or surface treatments (multi-select — user picks any combination)
- Each must have a kebab-case "id", a short human-readable "label" (1-3 words), and a "prompt" description (5-15 words) for an AI image generator
- Be creative and diverse — span different cultures, eras, and aesthetics
- Never repeat common defaults like "modern minimal", "rustic farmhouse", "mid-century modern"
- Labels must be concise and evocative

Return ONLY valid JSON in this exact format, no markdown, no explanation:
{"styles":[{"id":"example-id","label":"Example","prompt":"example description for image generation"}],"features":[{"id":"example-id","label":"Example","prompt":"example description for image generation"}]}`;

export async function GET(request: NextRequest) {
  // Optional seed param to get different results
  const seed = request.nextUrl.searchParams.get('seed') || String(Date.now());

  const apiKey = process.env.GOOGLE_AI_STUDIO_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GOOGLE_AI_STUDIO_KEY not configured' }, { status: 500 });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: `${PROMPT}\n\nSeed for variety: ${seed}`,
      config: { temperature: 1.2 },
    });

    const text = response.text?.trim() || '';
    // Strip markdown fences if present
    const json = text.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(json);

    // Validate structure
    if (!Array.isArray(parsed.styles) || !Array.isArray(parsed.features)) {
      throw new Error('Invalid response structure');
    }
    if (parsed.styles.length !== 5 || parsed.features.length !== 5) {
      throw new Error(`Expected 5+5 options, got ${parsed.styles.length}+${parsed.features.length}`);
    }
    for (const item of [...parsed.styles, ...parsed.features]) {
      if (!item.id || !item.label || !item.prompt) {
        throw new Error('Missing id, label, or prompt in option');
      }
    }

    return NextResponse.json(parsed);
  } catch (e: any) {
    console.error('Generate options error:', e);
    return NextResponse.json({ error: e.message || 'Failed to generate options' }, { status: 500 });
  }
}
