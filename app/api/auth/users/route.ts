import { NextResponse } from 'next/server';
import { getAllUsers, removeUser, toggleUserActive } from '@/lib/db';
import { getSessionUser } from '@/lib/session';
import { isAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  if (!isAdmin(session)) {
    return NextResponse.json(
      { error: 'Forbidden: Only administrators can view user accounts and active statuses.' },
      { status: 403 }
    );
  }

  try {
    const users = await getAllUsers(session);
    return NextResponse.json({ users });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  if (!isAdmin(session)) {
    return NextResponse.json(
      { error: 'Forbidden: Only administrators have the privilege to remove users.' },
      { status: 403 }
    );
  }

  try {
    const body = (await request.json()) as { user_id?: number };
    const userId = body.user_id ? Number(body.user_id) : NaN;

    if (isNaN(userId)) {
      return NextResponse.json({ error: 'Valid user_id is required.' }, { status: 400 });
    }

    if (userId === session.user_id) {
      return NextResponse.json({ error: 'Administrators cannot remove their own account.' }, { status: 400 });
    }

    const removed = await removeUser(userId, session);
    if (!removed) {
      return NextResponse.json({ error: 'User not found or could not be removed.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'User removed successfully.' });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  if (!isAdmin(session)) {
    return NextResponse.json(
      { error: 'Forbidden: Only administrators have the privilege to modify user active status.' },
      { status: 403 }
    );
  }

  try {
    const body = (await request.json()) as { user_id?: number; action?: string };
    const userId = body.user_id ? Number(body.user_id) : NaN;

    if (isNaN(userId)) {
      return NextResponse.json({ error: 'Valid user_id is required.' }, { status: 400 });
    }

    if (userId === session.user_id) {
      return NextResponse.json({ error: 'Administrators cannot modify their own active status.' }, { status: 400 });
    }

    const is_active = await toggleUserActive(userId, session);
    return NextResponse.json({ success: true, is_active });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
