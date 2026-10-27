// Private IPC fixture worker. Executes the real module background in a process
// whose RSS represents that module, rather than the combined owner-service test.
import pg from 'pg';
import {simulationCommerceBackground} from '../../modules/simulation-commerce/dist/definition.js';

let pool,runtime,busy=false;
const resources={processBoundary:'isolated-simulation-module',engineProcessId:process.pid,samples:0,observedPeakRssBytes:0,lastRssBytes:null,engineDatabaseBytes:null,maximumMemoryBytes:null,maximumDatabaseBytes:null};
function sample(){resources.samples++;resources.lastRssBytes=process.memoryUsage().rss;resources.observedPeakRssBytes=Math.max(resources.observedPeakRssBytes,resources.lastRssBytes);if(runtime){resources.maximumMemoryBytes=runtime.configuration.maximumMemoryBytes;resources.maximumDatabaseBytes=runtime.configuration.maximumDatabaseBytes;}}
async function close(){if(pool){await pool.end();pool=null;}}
process.on('disconnect',()=>{void close();});
process.on('message',async message=>{
 if(!message||!Number.isSafeInteger(message.requestId))return;
 const respond=value=>{if(process.connected)process.send({requestId:message.requestId,...value});};
 if(busy){respond({ok:false,code:'FIXTURE_WORKER_BUSY'});return;}busy=true;
 try{
  if(message.type==='initialize'){
   const c=message.connection;
   if(pool||c?.host!=='127.0.0.1'||!Number.isInteger(c.port)||c.port<1||!/^m_[a-f0-9]{20}$/.test(c.database)||message.runtime?.moduleId!=='steward.simulation.commerce')throw Error('FIXTURE_INITIALIZATION_INVALID');
   runtime=message.runtime;pool=new pg.Pool({...c,max:2,connectionTimeoutMillis:1000});await pool.query('SELECT 1');sample();respond({ok:true,resources});
  }else if(message.type==='tick'){
   if(!pool||message.runtime?.moduleId!==runtime.moduleId||message.runtime.installationId!==runtime.installationId)throw Error('FIXTURE_RUNTIME_INVALID');
   runtime=message.runtime;sample();await simulationCommerceBackground(pool,runtime);sample();respond({ok:true,resources});
  }else if(message.type==='stats'){
   if(!pool)throw Error('FIXTURE_NOT_INITIALIZED');sample();resources.engineDatabaseBytes=Number((await pool.query('SELECT pg_database_size(current_database()) AS n')).rows[0].n);respond({ok:true,resources});
  }else if(message.type==='close'){
   sample();await close();if(process.connected)process.send({requestId:message.requestId,ok:true,resources},()=>process.disconnect());
  }else throw Error('FIXTURE_OPERATION_UNSUPPORTED');
 }catch(error){
  // No connection strings, credentials, SQL bodies or runtime objects in IPC errors.
  const code=typeof error.code==='string'&&/^[A-Z0-9_]{1,64}$/.test(error.code)?error.code:/^FIXTURE_[A-Z_]+$/.test(error.message)?error.message:'FIXTURE_BACKGROUND_FAILED';respond({ok:false,code});
 }finally{busy=false;}
});
