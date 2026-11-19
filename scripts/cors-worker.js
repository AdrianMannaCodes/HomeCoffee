// Cloudflare Worker: CORS proxy for HomeCoffee GitHub Release assets, so Infinite Mac can fetch HomeCoffee-InfiniteMac.img.
// Only /releases/download/... paths of AdrianMannaCodes/HomeCoffee are forwarded. Supports GET, HEAD, OPTIONS and Range requests.
// Deploy: wrangler deploy scripts/cors-worker.js (set the Worker name in wrangler.toml or with --name).

const UPSTREAM = 'https://github.com/AdrianMannaCodes/HomeCoffee';
const ALLOWED_PREFIX = '/releases/download/';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, If-Range, If-None-Match, If-Modified-Since',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, Content-Type, ETag, Last-Modified',
  'Access-Control-Max-Age': '86400'
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: CORS });
    }

    const url = new URL(request.url);
    if (!url.pathname.startsWith(ALLOWED_PREFIX)) {
      return new Response('Not found', { status: 404, headers: CORS });
    }

    const target = UPSTREAM + url.pathname + url.search;
    const upstreamHeaders = new Headers();
    for (const h of ['Range', 'If-Range', 'If-None-Match', 'If-Modified-Since']) {
      const v = request.headers.get(h);
      if (v) upstreamHeaders.set(h, v);
    }

    // redirect: 'follow' lets fetch resolve GitHub's redirect to the release storage host, keeping Range working.
    const upstream = await fetch(target, {
      method: request.method,
      headers: upstreamHeaders,
      redirect: 'follow'
    });

    const headers = new Headers(CORS);
    for (const h of ['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges', 'ETag', 'Last-Modified']) {
      const v = upstream.headers.get(h);
      if (v) headers.set(h, v);
    }
    if (!headers.has('Accept-Ranges')) headers.set('Accept-Ranges', 'bytes');
    headers.set('Cache-Control', 'public, max-age=3600');

    return new Response(request.method === 'HEAD' ? null : upstream.body, {
      status: upstream.status,
      headers
    });
  }
};
