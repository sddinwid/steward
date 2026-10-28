/** Runtime service identity is independent of platform/distribution version. */
export function scientificVersionForPlatform(platformVersion:string):'1.0.0'|'1.1.0'|'1.2.0'{
 if(platformVersion==='0.12.0')return'1.0.0';
 if(platformVersion==='0.13.0')return'1.1.0';
 if(['0.14.0','0.15.0','0.16.0'].includes(platformVersion))return'1.2.0';
 throw new Error('Scientific service version is not declared for this platform release');
}
