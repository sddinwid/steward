// Run in its own Node process: optional governed contracts must stay unloaded
// while the independent legacy Sales definition is imported and constructed.
import {registerHooks} from 'node:module';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const hooks=registerHooks({resolve(specifier,context,next){
 if(specifier==='@steward/catalog-kit'||specifier.startsWith('@steward/catalog-kit/'))throw Error('Optional Catalog/Pricing contracts loaded during legacy Sales startup');
 return next(specifier,context);
}});
try{
 const {sales}=await import('../modules/sales/dist/definition.js');
 const manifest=JSON.parse(await readFile(new URL('../modules/sales/manifest.json',import.meta.url),'utf8'));
 const definition=sales(manifest);
 assert(definition.resources.some(r=>r.path==='/orders'));
 assert(definition.actions.some(a=>a.path==='/confirm/:id'));
 console.log('PASS legacy Sales starts while every optional Catalog/Pricing contract import is prohibited');
}finally{hooks.deregister();}
