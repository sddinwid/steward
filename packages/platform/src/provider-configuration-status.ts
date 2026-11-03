/** Sanitized categories only: never return exception messages, paths or values. */
export function providerConfigurationReason(hasPath:boolean,error:unknown){const code=(error as {code?:string})?.code;return !hasPath?'missing-path':code==='ENOENT'?'missing-file':['EACCES','EPERM'].includes(code??'')?'unreadable-file':'invalid-configuration';}
