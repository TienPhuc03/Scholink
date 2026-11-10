import { Injectable, Logger } from '@nestjs/common';
import * as net from 'net';
import { randomBytes } from 'crypto';

/** What the app receives on `users/<userId>/notifications` (lib/features/notification/push_listener.dart). */
export interface PushMessage {
  kind: 'notification';
  /** Stable per reminder milestone: the device shows each one once even if it arrives twice. */
  notificationKey: string;
  title: string;
  body: string;
  refUrl?: string;
  sentAt: string;
}

export interface MqttPushOptions {
  host: string;
  port: number;
  username?: string;
  password?: string;
  timeoutMs: number;
}

/** MQTT topic of one user's push messages; userId must not contain topic wildcards/levels. */
export function userPushTopic(userId: string): string {
  if (!userId || /[+#/\u0000]/.test(userId)) {
    throw new Error(`userId không hợp lệ cho topic MQTT: ${JSON.stringify(userId)}`);
  }
  return `users/${userId}/notifications`;
}

function encodeRemainingLength(n: number): Buffer {
  const bytes: number[] = [];
  do {
    let digit = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) digit |= 0x80;
    bytes.push(digit);
  } while (n > 0);
  return Buffer.from(bytes);
}

function mqttString(s: string): Buffer {
  const body = Buffer.from(s, 'utf8');
  const len = Buffer.alloc(2);
  len.writeUInt16BE(body.length);
  return Buffer.concat([len, body]);
}

function packet(typeAndFlags: number, ...parts: Buffer[]): Buffer {
  const body = Buffer.concat(parts);
  return Buffer.concat([Buffer.from([typeAndFlags]), encodeRemainingLength(body.length), body]);
}

export function buildConnect(clientId: string, username?: string, password?: string): Buffer {
  let flags = 0x02; // clean session
  if (username) flags |= 0x80;
  if (password) flags |= 0x40;
  const keepAlive = Buffer.alloc(2);
  keepAlive.writeUInt16BE(30);
  return packet(
    0x10,
    mqttString('MQTT'),
    Buffer.from([0x04, flags]), // protocol level 4 = MQTT 3.1.1
    keepAlive,
    mqttString(clientId),
    ...(username ? [mqttString(username)] : []),
    ...(password ? [mqttString(password)] : []),
  );
}

export function buildPublishQos1(topic: string, packetId: number, payload: Buffer): Buffer {
  const id = Buffer.alloc(2);
  id.writeUInt16BE(packetId);
  return packet(0x32, mqttString(topic), id, payload);
}

/**
 * Push channel over the project's EMQX broker (F23/F29). Each push opens a connection,
 * publishes with QoS 1 and waits for PUBACK, so a broker that is down or slow makes the job fail
 * and BullMQ retries it (bounded). Delivery reaches apps that are running or kept alive by the OS;
 * a killed app gets the message from its inbox on next open (SRS: "không hứa MQTT sống liên tục").
 */
@Injectable()
export class MqttPushPublisher {
  private readonly logger = new Logger(MqttPushPublisher.name);
  private readonly options: MqttPushOptions;

  constructor(options?: Partial<MqttPushOptions>) {
    const url = new URL(process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883');
    this.options = {
      host: options?.host ?? url.hostname,
      port: options?.port ?? Number(url.port || 1883),
      username: options?.username ?? (process.env.MQTT_USERNAME || undefined),
      password: options?.password ?? (process.env.MQTT_PASSWORD || undefined),
      timeoutMs: options?.timeoutMs ?? 5000,
    };
  }

  async publishToUser(userId: string, message: PushMessage): Promise<void> {
    await this.publish(userPushTopic(userId), Buffer.from(JSON.stringify(message), 'utf8'));
    this.logger.log(`[Push] MQTT ${userPushTopic(userId)} <- ${message.notificationKey}`);
  }

  publish(topic: string, payload: Buffer): Promise<void> {
    const { host, port, username, password, timeoutMs } = this.options;
    const clientId = `scholink-noti-${randomBytes(6).toString('hex')}`;
    const packetId = 1 + Math.floor(Math.random() * 65534);

    return new Promise<void>((resolve, reject) => {
      const socket = net.createConnection({ host, port });
      let buffer = Buffer.alloc(0);
      let settled = false;

      const finish = (err?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (!err) socket.end(Buffer.from([0xe0, 0x00])); // DISCONNECT
        socket.destroy();
        if (err) reject(err);
        else resolve();
      };
      const timer = setTimeout(
        () => finish(new Error(`MQTT broker ${host}:${port} không phản hồi sau ${timeoutMs}ms`)),
        timeoutMs,
      );

      socket.on('connect', () => socket.write(buildConnect(clientId, username, password)));
      socket.on('error', (e) => finish(new Error(`MQTT broker ${host}:${port}: ${e.message}`)));
      socket.on('close', () => finish(new Error('MQTT broker đóng kết nối trước khi xác nhận')));
      socket.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        // Read whole packets: [type][remaining length varint][body]
        for (;;) {
          if (buffer.length < 2) return;
          let len = 0;
          let mul = 1;
          let i = 1;
          let byte: number;
          do {
            if (i >= buffer.length) return;
            byte = buffer[i++];
            len += (byte & 0x7f) * mul;
            mul *= 128;
          } while (byte & 0x80);
          if (buffer.length < i + len) return;
          const type = buffer[0] >> 4;
          const body = buffer.subarray(i, i + len);
          buffer = buffer.subarray(i + len);

          if (type === 2) {
            // CONNACK
            const rc = body[1];
            if (rc !== 0) return finish(new Error(`MQTT CONNACK bị từ chối (mã ${rc})`));
            socket.write(buildPublishQos1(topic, packetId, payload));
          } else if (type === 4 && body.readUInt16BE(0) === packetId) {
            // PUBACK for our message
            return finish();
          }
        }
      });
    });
  }
}
