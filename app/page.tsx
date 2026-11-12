'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUp, BookOpen, ChevronDown, Database, FileText, Layers3, LogOut, Orbit, Plus, RefreshCw, Search, ShieldCheck, Trash2, Upload, X, AlertTriangle, Users, Cpu, Lock, CheckCircle2, Download } from 'lucide-react';
import { isAdmin, type CurrentUser } from '@/lib/auth';

type Source={chunk_id:string;document_title:string;mission:string;subsystem:string;chunk_index:number;similarity:number;text:string};
type Message={id:number;role:'user'|'assistant';text:string;sources?:Source[]};
type Chunk={chunk_id:string;chunk_index:number;token_count:number;text:string};
type Doc={document_id:number;title:string;file_name:string;mission:string;subsystem:string;chunk_count:number;uploaded_by_name?:string|null;chunks:Chunk[]};
type Mission={mission_code:string;mission_name:string}; type Subsystem={code:string;name:string};
type Anomaly={anomaly_id:number;anomaly_code:string;title:string;severity:string;status:string;mission_code:string;subsystem_code:string};
type Log={id:number;description:string;sql:string;timestamp:string;rowsAffected:number};
type Insight={stats:{totalDocuments:number;totalChunks:number;activeAnomalies:number;totalMissions:number};readiness:{subsystem_code:string;subsystem_name:string;total_indexed_documents:string;active_anomalies_count:string}[];};
type ManagedUser={user_id:number;username:string;full_name:string;email:string;department:string;is_active:boolean;created_at:string};
type ProviderConfig={mode:'default'|'gemini';hasKey:boolean;keyPreview:string|null;keyHash:string|null;modelName:string};
type GeminiModelOption={id:string;displayName:string;description?:string};
type Tab='rag'|'incidents'|'provider'|'database'|'users';

function AnswerText({text}:{text:string}) {
 const lines=text.split('\n');
 return <div className="answer-text">{lines.map((line,i)=>{const parts=line.split(/(\*\*[^*]+\*\*)/g);return <div key={i}>{parts.map((part,j)=>part.startsWith('**')&&part.endsWith('**')?<strong key={j}>{part.slice(2,-2)}</strong>:<span key={j}>{part}</span>)}{!line&&'\u00a0'}</div>;})}</div>;
}

async function api(url:string, options?:RequestInit) { const r=await fetch(url,options); const d=await r.json(); if(!r.ok) throw new Error(d.error||'Request failed.'); return d; }
const json=(method:string,data:unknown):RequestInit=>({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});

export default function HomePage() {
 const router=useRouter(); const [user,setUser]=useState<CurrentUser|null>(null); const [error,setError]=useState('');
 useEffect(()=>{fetch('/api/auth/me').then(async r=>{if(r.status===401){router.replace('/login');return;}const d=await r.json();if(!r.ok)throw Error(d.error);setUser(d.user);}).catch(()=>setError('Could not load your session. Check database configuration.'));},[router]);
 if(error)return <div className="centered"><div className="error-box">{error}</div><a href="/login">Return to sign in</a></div>;
 if(!user)return <div className="centered">Opening workspace…</div>;
 return <Workspace user={user}/>;
}

function Workspace({user}:{user:CurrentUser}) {
 const router=useRouter();
 const admin=isAdmin(user);
 const [tab,setTab]=useState<Tab>('rag'); const [messages,setMessages]=useState<Message[]>([]); const [question,setQuestion]=useState(''); const [thinking,setThinking]=useState(false);
 const [docs,setDocs]=useState<Doc[]>([]); const [expanded,setExpanded]=useState<number|null>(null); const [showUpload,setShowUpload]=useState(false); const [panel,setPanel]=useState(false);
 const [missions,setMissions]=useState<Mission[]>([]); const [subsystems,setSubsystems]=useState<Subsystem[]>([]);
 const [incident,setIncident]=useState<Anomaly[]>([]); const [logs,setLogs]=useState<Log[]>([]); const [insight,setInsight]=useState<Insight|null>(null); const [notice,setNotice]=useState('');
 const [title,setTitle]=useState(''); const [mission,setMission]=useState(''); const [subsystem,setSubsystem]=useState(''); const [content,setContent]=useState(''); const [filename,setFilename]=useState(''); const [selectedFile,setSelectedFile]=useState<File|null>(null); const [uploading,setUploading]=useState(false);
 const [showIncident,setShowIncident]=useState(false); const [incidentCode,setIncidentCode]=useState(''); const [incidentTitle,setIncidentTitle]=useState(''); const [severity,setSeverity]=useState('MODERATE'); const [incidentBusy,setIncidentBusy]=useState(false);
 const [deleteId,setDeleteId]=useState<number|null>(null); const [deleting,setDeleting]=useState(false); const end=useRef<HTMLDivElement>(null);
 const [userList,setUserList]=useState<ManagedUser[]>([]); const [userLoading,setUserLoading]=useState(false);
 const [deleteUserId,setDeleteUserId]=useState<number|null>(null); const [deletingUser,setDeletingUser]=useState(false);

 const [providerConfig,setProviderConfig]=useState<ProviderConfig>({mode:'default',hasKey:false,keyPreview:null,keyHash:null,modelName:'gemini-2.5-flash'});
 const [providerKeyInput,setProviderKeyInput]=useState('');
 const [providerModelInput,setProviderModelInput]=useState('gemini-2.5-flash');
 const [providerBusy,setProviderBusy]=useState(false);
 const [showKeyForm,setShowKeyForm]=useState(false);

 const [availableModels,setAvailableModels]=useState<GeminiModelOption[]>([
  {id:'gemini-2.5-flash',displayName:'Gemini 2.5 Flash'},
  {id:'gemini-2.0-flash',displayName:'Gemini 2.0 Flash'},
  {id:'gemini-1.5-flash',displayName:'Gemini 1.5 Flash'},
  {id:'gemini-1.5-pro',displayName:'Gemini 1.5 Pro'},
 ]);
 const [modelsLoading,setModelsLoading]=useState(false);
 const [modelsStatus,setModelsStatus]=useState('');

 async function loadDocs(){try{const d=await api('/api/documents');setDocs(d.documents||[]);}catch(e){setNotice(e instanceof Error?e.message:'Unable to load sources.');}}
 async function loadCatalog(){try{const d=await api('/api/catalog');setMissions(d.missions);setSubsystems(d.subsystems);setMission(d.missions[0]?.mission_code||'');setSubsystem(d.subsystems[0]?.code||'');}catch(e){setNotice(e instanceof Error?e.message:'Unable to load catalog.');}}
 async function loadAdmin(){if(!admin)return;try{const [i,l]=await Promise.all([api('/api/insights'),api('/api/sql-log')]);setInsight(i);setIncident(i.anomalies||[]);setLogs(l.sqlLog||[]);}catch(e){setNotice(e instanceof Error?e.message:'Unable to load database activity.');}}
 async function loadUsers(){if(!admin)return;setUserLoading(true);try{const d=await api('/api/auth/users');setUserList(d.users||[]);}catch(e){setNotice(e instanceof Error?e.message:'Unable to load users.');}finally{setUserLoading(false);}}

 async function loadModelsForSavedKey(){
  setModelsLoading(true);
  try{
   const res=await api('/api/provider/models');
   if(res.models&&res.models.length>0){
    setAvailableModels(res.models);
    if(res.live){
     setModelsStatus(`Loaded ${res.models.length} available models from Gemini API`);
    }
   }
  }catch{
   // Keep existing fallback models
  }finally{
   setModelsLoading(false);
  }
 }

 async function checkKeyAndLoadModels(keyToTest:string){
  const clean=keyToTest.trim();
  if(!clean||clean.length<10)return;
  setModelsLoading(true);
  setModelsStatus('Connecting to Google Gemini API to query available models…');
  try{
   const res=await api('/api/provider/models',json('POST',{apiKey:clean}));
   if(res.models&&res.models.length>0){
    setAvailableModels(res.models);
    setModelsStatus(`Key verified. Loaded ${res.models.length} available models.`);
    if(!res.models.some((m:GeminiModelOption)=>m.id===providerModelInput)){
     setProviderModelInput(res.models[0].id);
    }
   }
  }catch(e){
   setModelsStatus(e instanceof Error?`${e.message}`:'Could not verify key or fetch models.');
  }finally{
   setModelsLoading(false);
  }
 }

 async function loadProvider(){
  try{
   const d=await api('/api/provider');
   setProviderConfig(d);
   setProviderModelInput(d.modelName||'gemini-2.5-flash');
   if(d.hasKey){
    void loadModelsForSavedKey();
   }
  }catch(e){
   setNotice(e instanceof Error?e.message:'Unable to load provider configuration.');
  }
 }

 async function selectProviderMode(mode:'default'|'gemini'){
  if(mode==='gemini'&&!providerConfig.hasKey&&!providerKeyInput.trim()){setShowKeyForm(true);return;}
  setProviderBusy(true);setNotice('');
  try{
   const res=await api('/api/provider',json('POST',{mode,modelName:providerModelInput}));
   setProviderConfig(res);
   setNotice(mode==='gemini'?'Switched to Google Gemini API provider.':'Switched to Default pgvector Chunking provider.');
  }catch(e){setNotice(e instanceof Error?e.message:'Unable to update provider.');}finally{setProviderBusy(false);}
 }

 async function saveApiKey(e:FormEvent){
  e.preventDefault();if(!providerKeyInput.trim())return;setProviderBusy(true);setNotice('');
  try{
   const res=await api('/api/provider',json('POST',{mode:'gemini',apiKey:providerKeyInput.trim(),modelName:providerModelInput.trim()}));
   setProviderConfig(res);setProviderKeyInput('');setShowKeyForm(false);
   setNotice('Gemini API key encrypted (AES-256-GCM) and saved. SHA-256 fingerprint registered.');
   void loadModelsForSavedKey();
  }catch(e){setNotice(e instanceof Error?e.message:'Unable to save API key.');}finally{setProviderBusy(false);}
 }

 async function saveActiveModel(newModel:string){
  setProviderBusy(true);setNotice('');
  try{
   const res=await api('/api/provider',json('POST',{mode:'gemini',modelName:newModel}));
   setProviderConfig(res);
   setNotice(`Active model updated to ${newModel}.`);
  }catch(e){setNotice(e instanceof Error?e.message:'Unable to update model.');}finally{setProviderBusy(false);}
 }

 async function removeApiKey(){
  setProviderBusy(true);setNotice('');
  try{
   const res=await api('/api/provider',{method:'DELETE'});
   setProviderConfig(res);setShowKeyForm(false);setProviderKeyInput('');setModelsStatus('');
   setNotice('API key removed. Reverted to Default RAG Chunking.');
  }catch(e){setNotice(e instanceof Error?e.message:'Unable to remove API key.');}finally{setProviderBusy(false);}
 }

 async function toggleActive(targetUserId:number){if(!admin)return;try{const res=await api('/api/auth/users',json('PATCH',{user_id:targetUserId,action:'toggle_active'}));if(res.success){setUserList(prev=>prev.map(u=>u.user_id===targetUserId?{...u,is_active:res.is_active}:u));setNotice(`User status updated to ${res.is_active?'active':'inactive'}.`);}}catch(e){setNotice(e instanceof Error?e.message:'Unable to update status.');}}
 async function confirmRemoveUser(){if(!admin||deleteUserId===null)return;setDeletingUser(true);try{const res=await api('/api/auth/users',json('DELETE',{user_id:deleteUserId}));if(res.success){setUserList(prev=>prev.filter(u=>u.user_id!==deleteUserId));setNotice('User account removed successfully.');setDeleteUserId(null);}}catch(e){setNotice(e instanceof Error?e.message:'Unable to remove user.');}finally{setDeletingUser(false);}}

 useEffect(()=>{void loadDocs();void loadCatalog();void loadProvider();},[]);
 useEffect(()=>{if(tab==='database'&&admin)void loadAdmin();if(tab==='users'&&admin)void loadUsers();if(tab==='provider')void loadProvider();},[tab,admin]);
 useEffect(()=>{end.current?.scrollIntoView({behavior:'smooth'});},[messages,thinking]);

 async function send(e?:FormEvent){e?.preventDefault();const q=question.trim();if(!q||thinking)return;setMessages(p=>[...p,{id:Date.now(),role:'user',text:q}]);setQuestion('');setThinking(true);setNotice('');try{const d=await api('/api/chat',json('POST',{query:q}));setMessages(p=>[...p,{id:Date.now()+1,role:'assistant',text:d.answer,sources:d.sources}]);}catch(e){setMessages(p=>[...p,{id:Date.now()+1,role:'assistant',text:e instanceof Error?e.message:'Something went wrong.'}]);}finally{setThinking(false);}}
 async function addDocument(e:FormEvent){e.preventDefault();if(!title.trim()||(!selectedFile&&!content.trim()))return;setUploading(true);setNotice('');try{let d;if(selectedFile){const fd=new FormData();fd.append('file',selectedFile);fd.append('title',title.trim());fd.append('doc_type','STANDARD_PROCEDURE');const res=await fetch('/api/upload',{method:'POST',body:fd});d=await res.json();if(!res.ok)throw new Error(d.error||'Upload failed.');}else{d=await api('/api/upload',json('POST',{title:title.trim(),content,file_name:filename||`${title}.txt`,doc_type:'STANDARD_PROCEDURE'}));}setNotice(`Indexed ${d.chunks_created} chunks successfully.`);setShowUpload(false);setContent('');setTitle('');setFilename('');setSelectedFile(null);await loadDocs();}catch(e){setNotice(e instanceof Error?e.message:'Upload failed.');}finally{setUploading(false);}}
 async function fileChanged(file?:File){if(!file)return;if(!/\.(pdf|docx?|txt|md|markdown)$/i.test(file.name)){setSelectedFile(null);setNotice('Use a PDF, Word (.doc, .docx), or text (.txt, .md) file.');return;}if(file.size>100*1024*1024){setSelectedFile(null);setNotice('File exceeds the 100 MB limit.');return;}setSelectedFile(file);setFilename(file.name);if(!title.trim())setTitle(file.name.replace(/\.[^.]+$/, ''));if(/\.(txt|md|markdown)$/i.test(file.name)&&file.size<500000){try{setContent(await file.text());}catch{setContent('');}}else{setContent('');}}
 async function removeDocument(){if(deleteId===null)return;setDeleting(true);try{const d=await api('/api/documents/delete',json('DELETE',{document_id:deleteId}));if(!d.success)throw Error('Document not found.');setNotice('Document and its chunks deleted.');setDeleteId(null);await loadDocs();}catch(e){setNotice(e instanceof Error?e.message:'Unable to delete document.');}finally{setDeleting(false);}}
 async function resolve(id:number){try{const d=await api('/api/anomalies/resolve',json('PATCH',{anomaly_id:id}));if(!d.success)throw Error('Incident was not updated.');await loadAdmin();}catch(e){setNotice(e instanceof Error?e.message:'Unable to update incident.');}}
 async function createIncident(e:FormEvent){e.preventDefault();setIncidentBusy(true);try{await api('/api/anomalies',json('POST',{anomaly_code:incidentCode,title:incidentTitle,severity,mission,subsystem}));setShowIncident(false);setIncidentCode('');setIncidentTitle('');setNotice('Incident recorded.');await loadAdmin();}catch(e){setNotice(e instanceof Error?e.message:'Unable to add incident.');}finally{setIncidentBusy(false);}}
 async function logout(){try{await api('/api/auth/logout',{method:'POST'});router.replace('/login');router.refresh();}catch{setNotice('Unable to sign out. Try again.');}}

 return <div className="app-shell"><aside className="nav"><div className="nav-brand"><span className="brand-mark"><Orbit size={21}/></span><span>COSMOS</span></div>
   <div className="nav-label">WORKSPACE</div><nav className="nav-items" aria-label="Workspace"><button className={tab==='rag'?'nav-item active':'nav-item'} onClick={()=>setTab('rag')}><Search size={18}/> Knowledge chat</button><button className={tab==='incidents'?'nav-item active':'nav-item'} onClick={()=>setTab('incidents')}><AlertTriangle size={18}/> Incidents</button><button className={tab==='provider'?'nav-item active':'nav-item'} onClick={()=>setTab('provider')}><Cpu size={18}/> Provider</button>{admin&&<button className={tab==='database'?'nav-item active':'nav-item'} onClick={()=>setTab('database')}><Database size={18}/> Database activity</button>}{admin&&<button className={tab==='users'?'nav-item active':'nav-item'} onClick={()=>setTab('users')}><Users size={18}/> Users & access</button>}</nav>
   <div className="nav-lower"><div className="access-card"><ShieldCheck size={14}/><span>{admin?'Administrator':'Authenticated'}</span></div><div className="user-row"><div className="avatar">{user.full_name.slice(0,1).toUpperCase()}</div><div className="user-info"><strong>{user.full_name}</strong><span>@{user.username}</span></div><button className="icon-button logout" onClick={logout} title="Sign out" aria-label="Sign out"><LogOut size={18}/></button></div></div></aside>
 <div className="main-area"><header className="topbar"><div><strong>{tab==='rag'?'Knowledge chat':tab==='incidents'?'Incidents':tab==='provider'?'Provider settings':tab==='database'?'Database activity':'Users & access'}</strong></div><div className="top-actions">{tab==='rag'&&<button className="chat-provider-badge" onClick={()=>setTab('provider')} title="Model provider settings"><Cpu size={13}/> {providerConfig.mode==='gemini'?`Gemini (${providerConfig.modelName})`:'Default Chunking'}</button>}{tab==='rag'&&<button className="button subtle sources-toggle" onClick={()=>setPanel(!panel)}><BookOpen size={17}/> Sources <span>{docs.length}</span></button>}</div></header>
 {notice&&<div className="notice" role="status">{notice}<button onClick={()=>setNotice('')} aria-label="Dismiss"><X size={16}/></button></div>}
 {tab==='rag'?<div className="rag-layout"><main className="conversation"><div className="planet planet-corner" aria-hidden="true"><i className="ring-back"/><b/><i className="ring-front"/></div><div className="conversation-scroll">{messages.length===0?<div className="empty-chat"><h1>Knowledge<br/><em>within reach</em></h1><p>Search your mission documents and review the sources behind each answer.</p><div className="prompt-list"><button onClick={()=>setQuestion('What are the primary propulsion system risks?')}>What are the primary propulsion system risks?<ArrowUp size={16}/></button><button onClick={()=>setQuestion('Summarize the available guidance and navigation procedures.')}>Summarize guidance and navigation procedures<ArrowUp size={16}/></button></div></div>:<div className="message-list">{messages.map(m=><article key={m.id} className={`message ${m.role}`}><div className="message-avatar">{m.role==='assistant'?<Orbit size={17}/>:user.full_name.slice(0,1)}</div><div className="message-body"><div className="message-label">{m.role==='assistant'?'COSMOS':'YOU'}</div><div className="message-text"><AnswerText text={m.text}/></div>{m.sources&&m.sources.length>0&&<div className="citations"><div className="citation-heading">SOURCES USED</div>{m.sources.map((s,i)=><details key={s.chunk_id}><summary><FileText size={15}/><span>{i+1}. {s.document_title}</span><small>Chunk {s.chunk_index}</small><ChevronDown size={14}/></summary><p>{s.text}</p><small>{s.mission} / {s.subsystem} · Similarity {(s.similarity*100).toFixed(0)}%</small></details>)}</div>}</div></article>)}{thinking&&<div className="thinking"><span/> Searching sources and preparing an answer…</div>}<div ref={end}/></div>}</div>
 <div className="composer-wrap"><form className="composer" onSubmit={send}><textarea value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Ask about mission documents…" rows={2} maxLength={4000} aria-label="Ask a question" onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void send();}}}/><button disabled={thinking||!question.trim()} aria-label="Send question"><ArrowUp size={19}/></button></form></div></main>
 <aside className={`source-panel ${panel?'panel-open':''}`}><div className="source-header"><div><div className="eyebrow">KNOWLEDGE BASE</div><h2>{admin?'All sources':'My sources'} <span>{docs.length}</span></h2></div><button className="icon-button close-panel" onClick={()=>setPanel(false)} aria-label="Close sources"><X size={18}/></button></div><p className="source-description">{admin?'All documents and indexed chunks across workspace.':'Documents uploaded by your account, indexed for vector search.'}</p><div className="source-actions"><button className="button secondary" onClick={()=>{setMessages([]);setQuestion('');}}><Plus size={16}/> New conversation</button><button className="button dark" onClick={()=>{setNotice('');setShowUpload(true);}}><Upload size={16}/> Add document</button></div><div className="source-list"><div className="section-label">{admin?'ALL INDEXED DOCUMENTS (ADMIN)':'MY UPLOADED DOCUMENTS'} <button onClick={()=>void loadDocs()} aria-label="Refresh sources"><RefreshCw size={14}/></button></div>{docs.length===0?<div className="no-docs"><Layers3 size={24}/><strong>No documents available</strong><span>{admin?'Add a document to begin indexing.':'You have not uploaded any documents yet. Use "Add document" to upload.'}</span></div>:docs.map(d=><div key={d.document_id} className="doc-item"><button className="doc-button" onClick={()=>setExpanded(expanded===d.document_id?null:d.document_id)} aria-expanded={expanded===d.document_id}><div className="file-icon"><FileText size={17}/></div><div className="doc-main"><strong>{d.title}</strong><span>{d.mission} · {d.chunk_count} chunks{admin&&d.uploaded_by_name?` · by @${d.uploaded_by_name}`:''}</span></div><ChevronDown size={15}/></button>{expanded===d.document_id&&<div className="chunk-list"><div className="doc-meta">{d.subsystem}</div>{d.chunks.map(c=><details key={c.chunk_id}><summary>Chunk {c.chunk_index} <span>{c.token_count} tokens</span></summary><p>{c.text}</p></details>)}<button className="delete-link" onClick={()=>setDeleteId(d.document_id)}><Trash2 size={14}/> Delete document</button></div>}</div>)}</div></aside></div>:<main className="data-screen">{tab==='incidents'?<><div className="page-heading"><div><div className="eyebrow">MISSION ASSURANCE</div><h1>Incident register</h1><p>Review current and historical mission anomalies.</p></div><div className="row-actions"><button className="button secondary" onClick={()=>void loadAdmin()}><RefreshCw size={16}/> Refresh</button><button className="button dark" onClick={()=>{setNotice('');setShowIncident(true);}}><Plus size={16}/> Add incident</button></div></div><div className="table-wrap"><table><thead><tr><th>Incident</th><th>Mission / subsystem</th><th>Severity</th><th>Status</th><th>Action</th></tr></thead><tbody>{incident.map(a=><tr key={a.anomaly_id}><td><strong>{a.title}</strong><small>{a.anomaly_code}</small></td><td>{a.mission_code}<small>{a.subsystem_code}</small></td><td><span className={`severity sev-${a.severity.toLowerCase()}`}>{a.severity}</span></td><td>{a.status}</td><td>{a.status!=='RESOLVED'&&a.status!=='CLOSED'&&<button className="text-button" onClick={()=>void resolve(a.anomaly_id)}>Mark resolved</button>}</td></tr>)}</tbody></table>{!incident.length&&<p className="empty-table">No incident records found.</p>}</div></>:tab==='provider'?<><div className="page-heading"><div><div className="eyebrow">WORKSPACE SETTINGS</div><h1>Model provider</h1><p>Choose how answers are generated.</p></div><div className="row-actions"><button className="button secondary" onClick={()=>void loadProvider()} disabled={providerBusy}><RefreshCw size={16}/> Refresh</button></div></div>
 <div className="security-banner"><Lock size={18} style={{flexShrink:0,marginTop:2}}/><div><strong>API key security.</strong> Stored keys are encrypted and cannot be displayed.</div></div>
 <div className="provider-grid">
  <div className={`provider-card ${providerConfig.mode==='default'?'active':''}`}>
   <div><div className="provider-card-head"><div className="provider-icon"><Layers3 size={22}/></div><span className={`provider-pill ${providerConfig.mode==='default'?'active':'inactive'}`}>{providerConfig.mode==='default'?'ACTIVE':'STANDBY'}</span></div><h2>Default retrieval</h2><p>Retrieve relevant passages from your documents.</p>
    <div className="provider-meta-box"><div className="provider-meta-row"><span>Vector Dimension</span><strong>384 DIM</strong></div><div className="provider-meta-row"><span>Storage</span><strong>PostgreSQL + pgvector</strong></div><div className="provider-meta-row"><span>External Network</span><strong>None (100% Private)</strong></div><div className="provider-meta-row"><span>Required Credentials</span><strong>None (Zero Key)</strong></div></div>
   </div>
   <div style={{marginTop:'18px'}}>{providerConfig.mode==='default'?<button className="button dark" disabled style={{width:'100%',justifyContent:'center'}}><CheckCircle2 size={16}/> Active Provider</button>:<button className="button secondary" onClick={()=>void selectProviderMode('default')} disabled={providerBusy} style={{width:'100%',justifyContent:'center'}}>Switch to Default Chunking</button>}</div>
  </div>
  <div className={`provider-card ${providerConfig.mode==='gemini'?'active':''}`}>
   <div><div className="provider-card-head"><div className="provider-icon"><Orbit size={22}/></div><span className={`provider-pill ${providerConfig.mode==='gemini'?'active':'inactive'}`}>{providerConfig.mode==='gemini'?'ACTIVE':'STANDBY'}</span></div><h2>Google Gemini API</h2><p>Generate responses using Google Gemini and your retrieved documents.</p>
    {providerConfig.hasKey&&!showKeyForm?<div className="provider-meta-box">
      <div className="provider-meta-row"><span>Key Status</span><span className="status-badge status-active"><span className="dot"/> Configured & Encrypted</span></div>
      <div className="provider-meta-row"><span>Key Preview</span><strong>{providerConfig.keyPreview}</strong></div>
      <div className="provider-meta-row"><span>SHA-256 Digest</span><strong title="Cryptographic verification hash">{providerConfig.keyHash}</strong></div>
      <div className="provider-meta-row" style={{alignItems:'center'}}>
        <span>Active Model</span>
        <div style={{display:'flex',gap:'6px',alignItems:'center'}}>
          <select value={providerModelInput} onChange={e=>setProviderModelInput(e.target.value)} className="model-select">
            {availableModels.map(m=><option key={m.id} value={m.id}>{m.displayName||m.id}</option>)}
          </select>
          {providerModelInput!==providerConfig.modelName&&<button type="button" className="button subtle" style={{padding:'4px 8px',fontSize:'11px'}} onClick={()=>void saveActiveModel(providerModelInput)} disabled={providerBusy}>Update</button>}
        </div>
      </div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:'4px'}}>
        <span className="models-count">{availableModels.length} models available</span>
        <button type="button" className="text-button" style={{fontSize:'11px',display:'flex',alignItems:'center',gap:'4px'}} onClick={()=>void loadModelsForSavedKey()} disabled={modelsLoading}><RefreshCw size={12}/> Refresh model list</button>
      </div>
    </div>:<div className="provider-meta-box">
      <div className="provider-meta-row"><span>Key Status</span><span className="status-badge status-inactive"><span className="dot"/> {providerConfig.hasKey?'Replacing Key':'Not Configured'}</span></div>
      <div className="provider-meta-row"><span>Security</span><strong>AES-256-GCM + SHA-256</strong></div>
    </div>}
    {(!providerConfig.hasKey||showKeyForm)&&<form onSubmit={saveApiKey} className="provider-form">
      <label>
        Gemini API Key
        <div style={{display:'flex',gap:'8px'}}>
          <input
            type="password"
            value={providerKeyInput}
            onChange={e=>{
              setProviderKeyInput(e.target.value);
              if(e.target.value.trim().length>=20){void checkKeyAndLoadModels(e.target.value.trim());}
            }}
            onBlur={()=>{if(providerKeyInput.trim().length>=10){void checkKeyAndLoadModels(providerKeyInput.trim());}}}
            placeholder="Paste your Gemini API key (AIzaSy...)"
            required
            autoComplete="off"
            style={{flex:1}}
          />
          <button
            type="button"
            className="button secondary"
            style={{whiteSpace:'nowrap',fontSize:'12px',padding:'0 12px',display:'flex',alignItems:'center',gap:'6px'}}
            onClick={()=>void checkKeyAndLoadModels(providerKeyInput.trim())}
            disabled={modelsLoading||!providerKeyInput.trim()}
            title="Fetch available models from Gemini API"
          >
            <Download size={13}/> {modelsLoading?'Querying…':'Load Models'}
          </button>
        </div>
      </label>
      {modelsStatus&&<div className={`models-status ${modelsStatus.startsWith('Could not')?'error':'info'}`}>{modelsStatus}</div>}
      <label>
        Available Models {availableModels.length>0?`(${availableModels.length} available)`:''}
        <select value={providerModelInput} onChange={e=>setProviderModelInput(e.target.value)} disabled={modelsLoading}>
          {availableModels.map(m=><option key={m.id} value={m.id}>{m.displayName||m.id} {m.id==='gemini-2.5-flash'?'(Recommended)':''}</option>)}
        </select>
      </label>
      <div style={{display:'flex',gap:'8px',marginTop:'6px'}}>
        <button type="submit" className="button dark" disabled={providerBusy||!providerKeyInput.trim()}>{providerBusy?'Encrypting…':'Save & Encrypt API Key'}</button>
        {showKeyForm&&providerConfig.hasKey&&<button type="button" className="button secondary" onClick={()=>setShowKeyForm(false)}>Cancel</button>}
      </div>
    </form>}
   </div>
   <div style={{marginTop:'18px'}}>{providerConfig.hasKey&&!showKeyForm&&<div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>{providerConfig.mode!=='gemini'&&<button className="button dark" onClick={()=>void selectProviderMode('gemini')} disabled={providerBusy} style={{flex:1,justifyContent:'center'}}>Use Gemini Provider</button>}<button className="button secondary" onClick={()=>setShowKeyForm(true)} style={{flex:1,justifyContent:'center'}}>Change API Key</button><button className="button subtle danger-text" onClick={()=>void removeApiKey()} disabled={providerBusy} title="Remove stored key and switch to default chunking">Remove Key</button></div>}{!providerConfig.hasKey&&!showKeyForm&&<button className="button secondary" onClick={()=>setShowKeyForm(true)} style={{width:'100%',justifyContent:'center'}}>Configure Gemini API Key</button>}</div>
  </div>
 </div></>:tab==='users'&&admin?<><div className="page-heading"><div><div className="eyebrow">SYSTEM ADMINISTRATION</div><h1>Users & access</h1><p>Monitor active accounts, check status, and manage workspace user accounts.</p></div><div className="row-actions"><button className="button secondary" onClick={()=>void loadUsers()} disabled={userLoading}><RefreshCw size={16}/> Refresh</button></div></div><div className="table-wrap"><table><thead><tr><th>User</th><th>Email</th><th>Department</th><th>Status</th><th>Joined</th><th>Action</th></tr></thead><tbody>{userList.map(u=><tr key={u.user_id}><td><div style={{display:'flex',alignItems:'center',gap:'9px'}}><div className="avatar" style={{width:'28px',height:'28px',fontSize:'12px'}}>{u.full_name.slice(0,1).toUpperCase()}</div><div><strong>{u.full_name}</strong><small>@{u.username}</small></div></div></td><td>{u.email}</td><td>{u.department}</td><td><span className={`status-badge ${u.is_active?'status-active':'status-inactive'}`}><span className="dot"/> {u.is_active?'Active':'Inactive'}</span></td><td><small>{new Date(u.created_at).toLocaleDateString()}</small></td><td>{u.user_id!==user.user_id?<div style={{display:'flex',gap:'10px',alignItems:'center'}}><button className="text-button" onClick={()=>void toggleActive(u.user_id)}>{u.is_active?'Deactivate':'Activate'}</button><button className="text-button danger-text" onClick={()=>setDeleteUserId(u.user_id)}>Remove</button></div>:<small className="self-note">Administrator (You)</small>}</td></tr>)}</tbody></table>{!userList.length&&<p className="empty-table">No users registered.</p>}</div></>:admin?<><div className="page-heading"><div><div className="eyebrow">SYSTEM OBSERVABILITY</div><h1>Database activity</h1><p>Live query activity and relational knowledge health.</p></div><button className="button secondary" onClick={()=>void loadAdmin()}><RefreshCw size={16}/> Refresh</button></div><div className="metric-grid">{[['Documents',insight?.stats.totalDocuments],['Indexed chunks',insight?.stats.totalChunks],['Missions',insight?.stats.totalMissions],['Active incidents',insight?.stats.activeAnomalies]].map(([label,value])=><div className="metric" key={label}><span>{label}</span><strong>{value??'—'}</strong></div>)}</div><h2 className="data-title">Subsystem readiness</h2><div className="table-wrap"><table><thead><tr><th>Subsystem</th><th>Documents</th><th>Active incidents</th></tr></thead><tbody>{insight?.readiness.map(r=><tr key={r.subsystem_code}><td><strong>{r.subsystem_name}</strong><small>{r.subsystem_code}</small></td><td>{r.total_indexed_documents}</td><td>{r.active_anomalies_count}</td></tr>)}</tbody></table></div><h2 className="data-title">Recent SQL activity</h2><div className="log-list">{logs.map(l=><details key={l.id}><summary>{l.description}<span>{l.rowsAffected} rows</span></summary><pre>{l.sql}</pre></details>)}{!logs.length&&<p className="empty-table">No query activity yet.</p>}</div></>:null}</main>}</div>
 {showUpload&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget){setShowUpload(false);setSelectedFile(null);}}}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="upload-title"><div className="modal-head"><div><div className="eyebrow">KNOWLEDGE BASE</div><h2 id="upload-title">Add a document</h2><p>Supports PDF, DOC, DOCX, TXT, or MD up to 100 MB.</p></div><button className="icon-button" onClick={()=>{setShowUpload(false);setSelectedFile(null);}} aria-label="Close"><X size={20}/></button></div><form className="upload-form" onSubmit={addDocument}><label>Document title<input value={title} onChange={e=>setTitle(e.target.value)} required maxLength={255} placeholder="e.g. Flight operations handbook"/></label><label className="file-drop"><Upload size={19}/><span><strong>{selectedFile?selectedFile.name:'Choose a document file'}</strong> <small>{selectedFile?`${(selectedFile.size/(1024*1024)).toFixed(2)} MB`:'PDF, DOC, DOCX, TXT, or MD up to 100 MB'}</small></span><input type="file" accept=".pdf,.doc,.docx,.txt,.md,.markdown" onChange={e=>void fileChanged(e.target.files?.[0])}/></label>{!selectedFile&&<label>Document content<textarea value={content} onChange={e=>setContent(e.target.value)} rows={7} placeholder="Or paste document text here…"/></label>}{notice&&<div className="error-box" role="status">{notice}</div>}<p className="upload-hint">{selectedFile?`Ready to upload: ${selectedFile.name} (${(selectedFile.size/(1024*1024)).toFixed(2)} MB)`:'Supports PDF, DOC, DOCX, TXT, MD up to 100 MB'}</p><div className="modal-actions"><button type="button" className="button secondary" onClick={()=>{setShowUpload(false);setSelectedFile(null);}}>Cancel</button><button className="button dark" disabled={uploading||!title.trim()||(!selectedFile&&!content.trim())}>{uploading?'Indexing…':'Upload & index'}</button></div></form></section></div>}
 {showIncident&&<div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="incident-title"><div className="modal-head"><div><div className="eyebrow">MISSION ASSURANCE</div><h2 id="incident-title">Add an incident</h2><p>Record an anomaly for a mission and subsystem.</p></div><button className="icon-button" onClick={()=>setShowIncident(false)} aria-label="Close"><X size={20}/></button></div><form className="upload-form" onSubmit={createIncident}><label>Incident code<input value={incidentCode} onChange={e=>setIncidentCode(e.target.value)} maxLength={30} required placeholder="e.g. AN-101"/></label><label>Title<input value={incidentTitle} onChange={e=>setIncidentTitle(e.target.value)} maxLength={255} required/></label><div className="field-grid"><label>Mission<select value={mission} onChange={e=>setMission(e.target.value)} required><option value="">Choose mission</option>{missions.map(m=><option key={m.mission_code} value={m.mission_code}>{m.mission_name}</option>)}</select></label><label>Subsystem<select value={subsystem} onChange={e=>setSubsystem(e.target.value)} required><option value="">Choose subsystem</option>{subsystems.map(s=><option key={s.code} value={s.code}>{s.name}</option>)}</select></label></div><label>Severity<select value={severity} onChange={e=>setSeverity(e.target.value)}>{['LOW','MODERATE','SEVERE','CATASTROPHIC'].map(x=><option key={x}>{x}</option>)}</select></label>{notice&&<div className="error-box" role="status">{notice}</div>}<div className="modal-actions"><button type="button" className="button secondary" onClick={()=>setShowIncident(false)}>Cancel</button><button className="button dark" disabled={incidentBusy||!mission||!subsystem}>{incidentBusy?'Saving…':'Save incident'}</button></div></form></section></div>}
 {deleteId!==null&&<div className="modal-backdrop"><section className="modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-title"><div className="eyebrow">PERMANENT ACTION</div><h2 id="delete-title">Delete this document?</h2><p>Its indexed chunks will also be deleted. This cannot be undone.</p><div className="modal-actions"><button className="button secondary" onClick={()=>setDeleteId(null)}>Cancel</button><button className="button danger" onClick={()=>void removeDocument()} disabled={deleting}>{deleting?'Deleting…':'Delete document'}</button></div></section></div>}
 {deleteUserId!==null&&<div className="modal-backdrop"><section className="modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="del-user-title"><div className="eyebrow">PERMANENT ACTION</div><h2 id="del-user-title">Remove user account?</h2><p>This user will be permanently removed from the system and immediately signed out.</p><div className="modal-actions"><button className="button secondary" onClick={()=>setDeleteUserId(null)}>Cancel</button><button className="button danger" onClick={()=>void confirmRemoveUser()} disabled={deletingUser}>{deletingUser?'Removing…':'Remove user'}</button></div></section></div>}
 </div>;
}
