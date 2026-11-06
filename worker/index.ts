import { onRequest } from '../artifacts/ghad-concrete/functions/[[path]]';
import { assets } from './assets.generated';
export default {
  async fetch(request: Request, env: any) {
    return onRequest({request, env, next: async () => {
      const pathname = new URL(request.url).pathname;
      const asset = assets[pathname] ?? (pathname.startsWith('/assets/') ? null : assets['/']);
      if (!asset) return new Response('Not found', {status: 404});
      if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', {status: 405});
      return new Response(request.method === 'HEAD' ? null : asset.body, {headers: {'content-type': asset.type, 'x-content-type-options': 'nosniff', 'cache-control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache'}});
    }});
  }
};
