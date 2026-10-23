// Test harness around the production component and genuine authenticated routes.
import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {SmartModules} from '../../packages/ui/src/smart-modules.js';
import '../../packages/ui/src/style.css';
function Fixture(){
  const [csrf,setCsrf]=useState(''),[error,setError]=useState('');
  async function api(path:string,method='GET',body?:unknown){const r=await fetch('/api'+path,{method,headers:{'content-type':'application/json','x-csrf-token':csrf},...(body?{body:JSON.stringify(body)}:{})});const value=await r.json();if(!r.ok)throw new Error(value.error);return value;}
  useEffect(()=>{void api('/v2/auth/session').then(r=>setCsrf(r.csrfToken)).catch(()=>{});},[]);
  return <main><h1>Isolated SSMA browser acceptance</h1><p>Synthetic module fixtures; no live commerce connection.</p>{!csrf?<form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void api('/v2/auth/login','POST',{username:f.get('username'),password:f.get('password')}).then(r=>setCsrf(r.csrfToken)).catch(e=>setError(e.message));}}><label>Username<input name="username"/></label><label>Password<input name="password" type="password"/></label><button>Sign in</button></form>:<SmartModules api={api}/>}<p role="alert">{error}</p></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
