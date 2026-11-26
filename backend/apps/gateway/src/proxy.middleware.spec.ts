import * as http from 'http';
import { AddressInfo } from 'net';
import { PassThrough } from 'stream';
import { ReverseProxyMiddleware } from './proxy.middleware';

describe('ReverseProxyMiddleware body forwarding', () => {
  let server: http.Server;
  let received: { body: string; contentLength?: string }[];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        received.push({ body, contentLength: req.headers['content-length'] });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{"ok":true}');
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    process.env.COLLABORATION_SERVICE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    delete process.env.COLLABORATION_SERVICE_URL;
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => (received = []));

  // Mimics a request whose stream express.json() has already drained into req.body.
  async function proxy(rawBody: string, parsedBody: unknown) {
    const req: any = new PassThrough();
    req.end(rawBody);
    req.resume();
    await new Promise((resolve) => req.on('end', resolve));
    Object.assign(req, {
      method: 'POST',
      originalUrl: '/api/v1/teams/team_1/join-requests',
      headers: { 'content-type': 'application/json', 'content-length': String(rawBody.length) },
      body: parsedBody,
    });

    const res: any = new PassThrough();
    res.headersSent = false;
    res.writeHead = jest.fn();
    res.status = jest.fn(() => res);
    res.json = jest.fn();
    const done = new Promise((resolve) => res.on('finish', resolve));

    await new ReverseProxyMiddleware().use(req, res, jest.fn());
    await done;
    return res;
  }

  it('re-sends an empty JSON body instead of hanging until timeout', async () => {
    const res = await proxy('{}', {});
    expect(res.writeHead).toHaveBeenCalledWith(200, expect.anything());
    expect(received).toEqual([{ body: '{}', contentLength: '2' }]);
  });

  it('forwards a non-empty JSON body unchanged', async () => {
    await proxy('{"message":"hi"}', { message: 'hi' });
    expect(received).toEqual([{ body: '{"message":"hi"}', contentLength: '16' }]);
  });
});
