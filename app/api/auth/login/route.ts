import { NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/db';
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { username?: string; password?: string };
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!username || !password || username.length > 150 || password.length > 128) {
      return NextResponse.json(
        { success: false, error: 'Username and password are required.' },
        { status: 400 }
      );
    }

    const user = await authenticateUser(username, password);

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: 'Authentication failed: invalid username or password.',
        },
        { status: 401 }
      );
    }

    const response = NextResponse.json({
      success: true,
      message: `Authenticated as ${user.full_name}`,
      user,
    });

    response.cookies.set({
      name: SESSION_COOKIE,
      value: createSessionToken(user.user_id),
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_MAX_AGE,
    });

    return response;
  } catch (err) {
    return NextResponse.json(
      { success: false, error: 'Unable to sign in. Check server configuration.' },
      { status: 500 }
    );
  }
}