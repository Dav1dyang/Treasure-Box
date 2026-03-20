import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { buildSoundPrompt } from '@/lib/soundStyles';
import type { DrawerStyle } from '@/lib/types';

export const maxDuration = 60;

interface GenerateSoundsRequest {
  style: DrawerStyle;
}

interface SoundResult {
  data: string;      // base64-encoded audio
  mimeType: string;  // e.g. "audio/wav" or "audio/L16;rate=24000"
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateSoundsRequest = await request.json();
    const { style } = body;

    const apiKey = process.env.GOOGLE_AI_STUDIO_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GOOGLE_AI_STUDIO_KEY not configured' },
        { status: 500 }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-3.1-flash-preview',
      // @ts-expect-error - responseModalities not yet in types but supported by API
      generationConfig: { responseModalities: ['Audio'] },
    });

    // Generate all 3 sounds in parallel
    const soundTypes = ['collision', 'drawer-open', 'drawer-close'] as const;
    const prompts = soundTypes.map(type => buildSoundPrompt(style, type));

    const results = await Promise.allSettled(
      prompts.map(prompt => model.generateContent([{ text: prompt }]))
    );

    const sounds: Record<string, SoundResult | null> = {};
    const errors: string[] = [];

    soundTypes.forEach((type, i) => {
      const result = results[i];
      if (result.status === 'rejected') {
        errors.push(`${type}: ${result.reason?.message || 'Generation failed'}`);
        sounds[type] = null;
        return;
      }

      const response = result.value.response;
      const candidates = response.candidates;
      let audioData: SoundResult | null = null;

      if (candidates && candidates.length > 0) {
        const parts = candidates[0].content?.parts ?? [];
        for (const part of parts) {
          const inline = (part as any).inlineData;
          if (inline && inline.mimeType?.startsWith('audio/')) {
            audioData = { data: inline.data, mimeType: inline.mimeType };
            break;
          }
        }
      }

      if (!audioData) {
        errors.push(`${type}: No audio data in response`);
      }
      sounds[type] = audioData;
    });

    // Check if we got at least one sound
    const hasAnySounds = Object.values(sounds).some(s => s !== null);
    if (!hasAnySounds) {
      return NextResponse.json(
        { error: 'No sounds generated', details: errors },
        { status: 500 }
      );
    }

    return NextResponse.json({
      collision: sounds['collision'],
      drawerOpen: sounds['drawer-open'],
      drawerClose: sounds['drawer-close'],
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('Sound generation error:', error);
    return NextResponse.json(
      { error: error.message || 'Generation failed', details: String(error) },
      { status: 500 }
    );
  }
}
