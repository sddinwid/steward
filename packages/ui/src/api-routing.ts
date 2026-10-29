/** Same-origin application routing; authentication remains in SecurityConsole. */
export function applicationApiTarget(path:string):{url:string;timeoutMs:number}{
 const versioned=/^\/v(?:3|4|5|8|13|14|15|16)\//.test(path);
 return{url:versioned?`/api${path}`:`/api/v2${path}`,timeoutMs:versioned?90000:15000};
}
