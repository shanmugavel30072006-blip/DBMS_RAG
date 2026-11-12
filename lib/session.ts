import { cookies } from 'next/headers';
import { readSessionToken, SESSION_COOKIE } from './auth';
import { getUserById } from './db';

export type SessionUser = NonNullable<Awaited<ReturnType<typeof getUserById>>>;

export async function getSessionUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const userId = readSessionToken(token);
  if (!userId) return null;
  return getUserById(userId);
}