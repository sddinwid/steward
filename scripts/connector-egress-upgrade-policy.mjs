// Pure policy for the existing operator egress CLI. Candidate must first pass verifyPackage.
import assert from 'node:assert/strict';
import {atLeast,assertNoModuleIdentityReplacement} from '../packages/module-sdk/dist/index.js';
export function assertEgressHostVersions({hostProtocolVersion,platformRelease,candidateMinimum}){
 assert(typeof hostProtocolVersion==='string'&&atLeast(hostProtocolVersion,'0.8.1'),'Module host connector-egress protocol support required');
 assert(typeof platformRelease==='string'&&typeof candidateMinimum==='string'&&atLeast(platformRelease,candidateMinimum),'Upgrade the selected running platform image to the candidate minimum platform version first');
}
export function parseEgressArguments(args){
 const options={};
 for(let n=0;n<args.length;n++){
  const key=args[n];if(key==='--revoke'){options.revoke=true;continue;}
  if(!['--directory','--worker','--subnet','--module','--upgrade-package','--expected-image','--execution-plan'].includes(key)||!args[n+1]||args[n+1].startsWith('--'))throw Error('Use --directory, --worker, --module, optional --subnet or --revoke; image upgrade requires --upgrade-package and --expected-image');
  if(Object.hasOwn(options,key.slice(2)))throw Error('Duplicate option requires explicit correction');
  options[key.slice(2)]=args[++n];
 }
 if(options['execution-plan']&&(options['upgrade-package']||options['expected-image']||options.subnet||options.revoke))throw Error('Execution plan renewal cannot mix other network changes');
 const upgrade=Boolean(options['upgrade-package']||options['expected-image']);
 if(upgrade&&(!options['upgrade-package']||!options['expected-image']||options.subnet||options.revoke))throw Error('Upgrade approval requires both exact package and image; subnet changes and revoke are forbidden');
 return{options,upgrade};
}
export function planUpgradeGrant({id,packageId,expectedImage,installed,candidate,applied,runtime,actual,host,network,expectedNetwork}){
 assert(['cee.shopify','cee.printify','cee.marketing'].includes(id),'Unsupported connector');
 assert.equal(packageId,id+'@'+candidate.manifest.version,'Exact upgrade package required');
 assert.equal(candidate.manifest.moduleId,id);assert.equal(installed.manifest.moduleId,id);
 assert.equal(candidate.manifest.connector?.provider,id==='cee.marketing'?'ga4':id.slice(4));
 assert.equal(candidate.imageId,expectedImage,'Expected image differs from trusted candidate');
 assert.notEqual(candidate.imageId,installed.imageId,'Upgrade requires a new image');
 assert.notEqual(candidate.manifest.version,installed.manifest.version,'Do not rebuild an installed package version');
 assert(atLeast(candidate.manifest.version,installed.manifest.version),'Upgrade cannot downgrade a connector');
 assert.equal(actual.Image,installed.imageId,'Running image changed since installed descriptor');
 assert.equal(actual.Config.Labels['steward.managed-by'],'module-host-v1');
 assert.equal(actual.Config.Labels['steward.installation'],host.installationId);
 assert.equal(actual.Config.Labels['steward.module'],id);
 assert.equal(runtime.installationId,host.installationId);assert.equal(runtime.moduleId,id);
 assert.equal(runtime.version,installed.manifest.version,'Runtime version differs from installed descriptor');
 assert.equal(runtime.configuration.mode,'live','Image-bound live upgrade only');
 const old=installed.manifest.persistence.migrations,next=candidate.manifest.persistence.migrations;
 assert.equal(applied.length,old.length,'Applied migration count differs from installed descriptor');
 assert.deepEqual(runtime.persistence.migrations,old,'Runtime migration declaration differs');
 for(let n=0;n<old.length;n++){assert.deepEqual(applied[n],old[n],'Applied migration changed');assert.deepEqual(next[n],old[n],'Candidate rewrites historical migration');}
 assert.equal(host.connectorEgress?.[id]?.imageId,installed.imageId,'Existing approval is stale');
 assert.deepEqual(Object.keys(host.connectorEgress[id]).sort(),['imageId','network'],'Unexpected grant fields require explicit review');
 assert.equal(host.connectorEgress[id].network,expectedNetwork,'Approved network scope changed');
 assert(network,'Upgrade cannot create a network');assert.equal(network.Name,expectedNetwork);
 assert.equal(network.Internal,false);assert.equal(network.Driver,'bridge');
 assert.equal(network.Labels?.['steward.egress.installation'],host.installationId);
 assert.equal(network.Labels?.['steward.egress.module'],id);
 for(const containerId of Object.keys(network.Containers??{}))assert.equal(containerId,actual.Id,'Foreign endpoint on approved connector network');
 const after=structuredClone(host);after.connectorEgress[id]={network:expectedNetwork,imageId:expectedImage};
 const a=structuredClone(host),b=structuredClone(after);delete a.connectorEgress[id];delete b.connectorEgress[id];
 assert.deepEqual(a,b,'Unrelated host field changed');
 assertNoModuleIdentityReplacement(installed.imageId,candidate.imageId);
 return after;
}
