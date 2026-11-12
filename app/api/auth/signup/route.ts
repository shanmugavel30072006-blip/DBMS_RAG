import { NextResponse } from 'next/server';
import { dbQueryOne } from '@/lib/pg';
import { hashPassword, createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    const b = await request.json();
    const username = typeof b.username === 'string' ? b.username.trim() : '';
    const fullName = typeof b.full_name === 'string' ? b.full_name.trim() : '';
    const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
    const password = typeof b.password === 'string' ? b.password : '';
    if (!/^[a-zA-Z0-9_.-]{3,60}$/.test(username) || fullName.length < 2 || fullName.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150 || password.length < 12 || password.length > 128) {
      return NextResponse.json({error: 'Use a 3–60 character username, a valid name and email, and a 12–128 character password.'}, {status: 400});
    }
    if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET is not configured');
    const row = await dbQueryOne<{user_id:number}>(`INSERT INTO users (username, full_name, email, department, password_hash)
      VALUES ($1,$2,$3,'Engineering',$4) RETURNING user_id`, [username, fullName, email, hashPassword(password)], 'AUTH: create user account');
    if (!row) throw new Error('Account creation failed');
    const response = NextResponse.json({success:true});
    response.cookies.set({name:SESSION_COOKIE, value:createSessionToken(row.user_id), httpOnly:true, sameSite:'lax', secure:process.env.NODE_ENV==='production', path:'/', maxAge:SESSION_MAX_AGE});
    return response;
  } catch (e) {
    if ((e as {code?:string}).code === '23505') return NextResponse.json({error:'Username or email is already in use.'}, {status:409});
    console.error('Signup failed', e);
    return NextResponse.json({error:'Unable to create account. Check server configuration.'}, {status:500});
  }
}
