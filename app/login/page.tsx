'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Eye, EyeOff, Orbit } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [mode,setMode] = useState<'login'|'signup'>('login');
  const [username,setUsername]=useState(''); const [password,setPassword]=useState('');
  const [fullName,setFullName]=useState(''); const [email,setEmail]=useState('');
  const [show,setShow]=useState(false); const [error,setError]=useState(''); const [busy,setBusy]=useState(false);
  async function submit(event:FormEvent) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const res=await fetch(`/api/auth/${mode}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password,full_name:fullName,email})});
      const data=await res.json(); if (!res.ok) throw new Error(data.error||'Unable to continue.');
      router.replace('/'); router.refresh();
    } catch(e) {setError(e instanceof Error?e.message:'Unable to continue.');} finally{setBusy(false);}
  }
  return <main className="auth-layout">
    <section className="auth-story"><div className="auth-brand"><span className="brand-mark"><Orbit size={20}/></span><span>COSMOS</span></div>
      <div className="story-content"><h1>Intelligence<br/><em>Across the Cosmos</em></h1></div>
      <div className="orbit-art" aria-hidden="true">
        <div className="orbit-tilt"><span/><span/><span/></div>
        <div className="planet">
          <i className="ring-back"/>
          <b/>
          <i className="ring-front"/>
        </div>
      </div></section>
    <section className="auth-side"><div className="auth-card"><h2>{mode==='login'?'Welcome back.':'Create your account.'}</h2><p className="auth-sub">{mode==='login'?'Sign in to access the knowledge workspace.':'New accounts start with public, read-only access.'}</p>
      <form onSubmit={submit} className="auth-form">
        {mode==='signup'&&<><label>Full name<input value={fullName} onChange={e=>setFullName(e.target.value)} autoComplete="name" required maxLength={120} placeholder="Your full name"/></label><label>Email address<input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" required maxLength={150} placeholder="you@example.com"/></label></>}
        <label>{mode==='login'?'Username or email':'Username'}<input value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username" required maxLength={150} placeholder="Enter your username"/></label>
        <label>Password<div className="password-field"><input type={show?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} autoComplete={mode==='login'?'current-password':'new-password'} required minLength={mode==='signup'?12:1} maxLength={128} placeholder={mode==='signup'?'At least 12 characters':'Enter your password'}/><button type="button" onClick={()=>setShow(!show)} aria-label={show?'Hide password':'Show password'} aria-pressed={show}>{show?<EyeOff size={19}/>:<Eye size={19}/>}</button></div></label>
        {error&&<div className="error-box" role="alert">{error}</div>}
        <button className="button primary auth-submit" disabled={busy}>{busy?'Please wait…':mode==='login'?'Sign in':'Create account'}<ArrowRight size={18}/></button>
      </form><p className="auth-switch">{mode==='login'?"Don't have an account?":"Already have an account?"} <button type="button" onClick={()=>{setMode(mode==='login'?'signup':'login');setError('');setPassword('');}}>{mode==='login'?'Create account':'Sign in'}</button></p>
      </div></section>
  </main>;
}
