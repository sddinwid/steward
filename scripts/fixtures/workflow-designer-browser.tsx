import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {WorkflowDesigner} from '../../packages/ui/src/workflow-designer.js';
import '../../packages/ui/src/style.css';
const binding={bindingId:'00000000-0000-4000-8000-000000000001',provider:'Synthetic inventory fixture',capability:'inventory.stock.reserve',contractVersion:'1.0.0',state:'approved',sensitivity:'business',operations:[{name:'reserve',permission:'fixture.inventory.write',input:{type:'object'},output:{type:'object'}}]};
function Fixture(){const [value,setValue]=useState<unknown>(),[saved,setSaved]=useState<unknown>(),[readOnly,setReadOnly]=useState(false);
  return <main className="application-shell"><div className="content module-console"><h1>Synthetic component fixture</h1><p>No backend, installed module or operational execution is represented.</p>
    <button onClick={()=>setReadOnly(v=>!v)}>Toggle read-only</button>
    <form onSubmit={e=>{e.preventDefault();setSaved(value);}}><WorkflowDesigner value={value} onChange={setValue} bindings={[binding]} readOnly={readOnly}/><button type="submit">Save fixture</button></form>
    <output hidden data-testid="saved">{JSON.stringify(saved??null)}</output><output hidden data-testid="graph">{JSON.stringify(value??null)}</output>
  </div></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
