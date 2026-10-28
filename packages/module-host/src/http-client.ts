import {request,type RequestOptions} from 'node:http';

export function moduleHttp(options: RequestOptions, body?: unknown): Promise<{ status: number; value: any;providerConfigurationDigest?:string }> {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const req = request({ ...options, signal:AbortSignal.timeout(options.timeout??15000), headers: { ...options.headers, ...(data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}) }, timeout: options.timeout??15000 }, res => {
      let value = ''; res.setEncoding('utf8');
      res.on('data', chunk => { value += chunk; if (value.length > 1048576) req.destroy(new Error('Response exceeds limit')); });
      res.on('end', () => { try { const captured=res.headers['x-steward-provider-configuration-digest'];resolve({ status: res.statusCode ?? 500, value: value ? JSON.parse(value) : {},...(typeof captured==='string'&&/^[a-f0-9]{64}$/.test(captured)?{providerConfigurationDigest:captured}:{}) }); } catch { reject(new Error('Invalid runtime response')); } });
    });
    req.on('timeout', () => req.destroy(new Error('Runtime timeout'))); req.on('error', reject); req.end(data);
  });
}
