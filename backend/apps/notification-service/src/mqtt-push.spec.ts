import * as net from 'net';
import { AddressInfo } from 'net';
import {
  MqttPushPublisher,
  buildConnect,
  buildPublishQos1,
  userPushTopic,
} from './infrastructure/push/mqtt-push.publisher';

/** Minimal MQTT 3.1.1 broker double: answers CONNACK and PUBACK, records PUBLISH packets. */
function fakeBroker(opts: { connackCode?: number; ackPublish?: boolean } = {}) {
  const published: Array<{ topic: string; payload: string; qos: number }> = [];
  const connects: Buffer[] = [];
  const server = net.createServer((sock) => {
    let buf = Buffer.alloc(0);
    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      for (;;) {
        if (buf.length < 2) return;
        let len = 0;
        let mul = 1;
        let i = 1;
        let b: number;
        do {
          if (i >= buf.length) return;
          b = buf[i++];
          len += (b & 0x7f) * mul;
          mul *= 128;
        } while (b & 0x80);
        if (buf.length < i + len) return;
        const header = buf[0];
        const body = buf.subarray(i, i + len);
        buf = buf.subarray(i + len);
        const type = header >> 4;
        if (type === 1) {
          connects.push(body);
          sock.write(Buffer.from([0x20, 0x02, 0x00, opts.connackCode ?? 0]));
        } else if (type === 3) {
          const tlen = body.readUInt16BE(0);
          const topic = body.subarray(2, 2 + tlen).toString('utf8');
          const qos = (header >> 1) & 0x03;
          const id = body.readUInt16BE(2 + tlen);
          published.push({ topic, qos, payload: body.subarray(4 + tlen).toString('utf8') });
          if (opts.ackPublish !== false) sock.write(Buffer.from([0x40, 0x02, id >> 8, id & 0xff]));
        }
      }
    });
  });
  return new Promise<{ port: number; published: typeof published; connects: Buffer[]; close: () => void }>(
    (resolve) =>
      server.listen(0, '127.0.0.1', () =>
        resolve({
          port: (server.address() as AddressInfo).port,
          published,
          connects,
          close: () => server.close(),
        }),
      ),
  );
}

const message = {
  kind: 'notification' as const,
  notificationKey: 'reminder:opp_1:7d:v1',
  title: 'Nhắc hạn: Học bổng A',
  body: '"Học bổng A" còn 7 ngày là đóng đăng ký.',
  refUrl: '/opportunities/opp_1',
  sentAt: '2026-11-08T00:00:00.000Z',
};

describe('MQTT push channel (F23/F29)', () => {
  it('publishes the reminder with QoS 1 on the user topic and waits for PUBACK', async () => {
    const broker = await fakeBroker();
    const pub = new MqttPushPublisher({ host: '127.0.0.1', port: broker.port, timeoutMs: 2000 });

    await pub.publishToUser('usr_student_001', message);

    expect(broker.published).toHaveLength(1);
    expect(broker.published[0].topic).toBe('users/usr_student_001/notifications');
    expect(broker.published[0].qos).toBe(1);
    expect(JSON.parse(broker.published[0].payload)).toEqual(message);
    broker.close();
  });

  it('sends credentials when configured (EMQX auth)', async () => {
    const broker = await fakeBroker();
    const pub = new MqttPushPublisher({
      host: '127.0.0.1',
      port: broker.port,
      username: 'noti-svc',
      password: 's3cret',
      timeoutMs: 2000,
    });
    await pub.publishToUser('u1', message);
    const connect = broker.connects[0].toString('latin1');
    expect(connect).toContain('noti-svc');
    expect(connect).toContain('s3cret');
    broker.close();
  });

  it('fails (so BullMQ retries) when the broker refuses, does not ack, or is down', async () => {
    const refusing = await fakeBroker({ connackCode: 5 });
    await expect(
      new MqttPushPublisher({ host: '127.0.0.1', port: refusing.port, timeoutMs: 2000 }).publishToUser('u1', message),
    ).rejects.toThrow('CONNACK');
    refusing.close();

    const silent = await fakeBroker({ ackPublish: false });
    await expect(
      new MqttPushPublisher({ host: '127.0.0.1', port: silent.port, timeoutMs: 300 }).publishToUser('u1', message),
    ).rejects.toThrow('không phản hồi');
    silent.close();

    await expect(
      new MqttPushPublisher({ host: '127.0.0.1', port: 1, timeoutMs: 2000 }).publishToUser('u1', message),
    ).rejects.toThrow();
  });

  it('never builds a topic that could reach other users', () => {
    expect(() => userPushTopic('+')).toThrow();
    expect(() => userPushTopic('a/b')).toThrow();
    expect(() => userPushTopic('#')).toThrow();
    expect(userPushTopic('usr_1')).toBe('users/usr_1/notifications');
  });

  it('encodes packets per MQTT 3.1.1 (remaining length over 127 bytes)', () => {
    const big = Buffer.alloc(300, 0x61);
    const p = buildPublishQos1('t', 7, big);
    expect(p[0]).toBe(0x32);
    // 2 (topic len) + 1 (topic) + 2 (packet id) + 300 = 305 -> 0xB1 0x02
    expect([p[1], p[2]]).toEqual([0xb1, 0x02]);
    expect(buildConnect('c')[0]).toBe(0x10);
  });
});
