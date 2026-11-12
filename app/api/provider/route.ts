import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import {
  getUserProviderSafe,
  setUserProvider,
  clearUserApiKey,
  type ProviderMode,
} from '@/lib/provider';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const provider = await getUserProviderSafe(user.user_id);
    return NextResponse.json(provider);
  } catch (err) {
    console.error('Failed to get provider settings:', err);
    return NextResponse.json({ error: 'Unable to load provider configuration.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const body = await request.json();
    const mode = (body.mode === 'gemini' ? 'gemini' : 'default') as ProviderMode;
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : undefined;
    const modelName = typeof body.modelName === 'string' ? body.modelName.trim() : undefined;

    // Validate mode and model
    if (modelName && !/^[a-zA-Z0-9._-]+$/.test(modelName)) {
      return NextResponse.json({ error: 'Invalid model name specified.' }, { status: 400 });
    }

    // If setting to Gemini mode and no key provided, check if a key already exists
    if (mode === 'gemini' && (!apiKey || apiKey.length === 0)) {
      const existing = await getUserProviderSafe(user.user_id);
      if (!existing.hasKey && !process.env.GEMINI_API_KEY) {
        return NextResponse.json(
          { error: 'Please enter a valid Gemini API key to enable Gemini mode.' },
          { status: 400 }
        );
      }
    }

    const updated = await setUserProvider(user.user_id, {
      mode,
      apiKey: apiKey && apiKey.length > 0 ? apiKey : undefined,
      modelName,
    });

    return NextResponse.json({ success: true, ...updated });
  } catch (err) {
    console.error('Failed to update provider settings:', err);
    return NextResponse.json({ error: 'Unable to update provider configuration.' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const cleared = await clearUserApiKey(user.user_id);
    return NextResponse.json({ success: true, ...cleared });
  } catch (err) {
    console.error('Failed to clear provider API key:', err);
    return NextResponse.json({ error: 'Unable to clear API key.' }, { status: 500 });
  }
}
