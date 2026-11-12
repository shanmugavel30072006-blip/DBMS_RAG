import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import {
  getDecryptedUserApiKey,
  fetchGeminiModels,
  FALLBACK_GEMINI_MODELS,
} from '@/lib/provider';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const { apiKey } = await getDecryptedUserApiKey(user.user_id);
    const effectiveKey = apiKey || process.env.GEMINI_API_KEY;

    if (!effectiveKey) {
      return NextResponse.json({
        success: true,
        live: false,
        models: FALLBACK_GEMINI_MODELS,
      });
    }

    try {
      const liveModels = await fetchGeminiModels(effectiveKey);
      return NextResponse.json({
        success: true,
        live: true,
        models: liveModels,
      });
    } catch (err) {
      console.warn('Could not fetch live Gemini models, using defaults:', err);
      return NextResponse.json({
        success: true,
        live: false,
        models: FALLBACK_GEMINI_MODELS,
        warning: err instanceof Error ? err.message : 'Could not fetch live models.',
      });
    }
  } catch (err) {
    console.error('Error fetching provider models:', err);
    return NextResponse.json(
      { error: 'Unable to retrieve available models.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const body = await request.json();
    let keyToUse = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';

    if (!keyToUse) {
      const stored = await getDecryptedUserApiKey(user.user_id);
      keyToUse = stored.apiKey || process.env.GEMINI_API_KEY || '';
    }

    if (!keyToUse) {
      return NextResponse.json(
        { error: 'Enter a Gemini API key to query available models.' },
        { status: 400 }
      );
    }

    const liveModels = await fetchGeminiModels(keyToUse);
    return NextResponse.json({
      success: true,
      live: true,
      models: liveModels,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to retrieve models from Google Gemini.';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

