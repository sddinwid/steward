import {assertImmutableImageTag} from './release-contracts.mjs';

// Call only after verifyBundle has verified the archive and all payload checksums.
// Inspect is read-only and returns Docker image metadata or null for an absent image.
export function planReleaseImageImport({images,packages,inspect}){
 const required=new Set(),tags=new Map();
 const add=(id,tag)=>{
  assertImmutableImageTag(tag,undefined,id);
  if(typeof tag!=='string'||!tag)throw Error('Release image tag is missing');
  if(tags.has(tag)&&tags.get(tag)!==id)throw Error('Release declares conflicting immutable image tag: '+tag);
  required.add(id);tags.set(tag,id);
 };
 for(const image of Object.values(images))add(image.id,image.tag);
 for(const payload of packages)add(payload.imageId,payload.manifest.moduleId+':'+payload.manifest.version);
 if(!required.size)throw Error('Release has no declared image payload');
 // Check every existing declared tag before either skipping OR importing the archive.
 for(const [tag,id] of tags){const actual=inspect(tag);if(actual)assertImmutableImageTag(tag,actual.Id,id);}
 const missing=[];
 for(const id of required){const actual=inspect(id);if(!actual)missing.push(id);else if(actual.Id!==id)throw Error('Exact release image inspection returned different content: '+id);}
 return{skipImport:missing.length===0,imageCount:required.size,missing};
}
