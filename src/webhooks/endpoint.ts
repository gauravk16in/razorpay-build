import Fastify, { type FastifyInstance } from 'fastify';
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import type { Ledger } from '../contracts/interfaces.js';
import type { WebhookEventRecord } from '../contracts/schemas.js';

const hmacHex = (body: Buffer, secret: string): string =>
  createHmac('sha256', secret).update(body).digest('hex');

const safeEq = (a: string, b: string): boolean => {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ba.length === bb.length && timingSafeEqual(ba, bb);
};

// Razorpay webhook ingestion (F5–F7): verify the signature over the RAW body
// before any parsing; dedupe by x-razorpay-event-id; record facts only —
// this endpoint has zero authority to approve or execute anything (§03).
export function buildWebhookApp(opts: {
  ledger: Ledger;
  secret: string;
  clock?: () => number;
}): FastifyInstance {
  const { ledger, secret } = opts;
  const clock = opts.clock ?? (() => Date.now());
  const app = Fastify({ logger: false });

  // Raw-body preservation: no JSON parsing before signature verification.
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => {
    done(null, body);
  });

  app.post('/webhooks/razorpay', async (req, reply) => {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body ?? ''), 'utf8');
    const signature = req.headers['x-razorpay-signature'] as string | undefined;
    const headerEventId = req.headers['x-razorpay-event-id'] as string | undefined;
    const eventId = headerEventId ?? `raw_${createHash('sha256').update(raw).digest('hex')}`;
    const rawHash = createHash('sha256').update(raw).digest('hex');

    const base = {
      event_id: eventId,
      raw_hash: rawHash,
      received_at: clock(),
    };

    if (!signature || !safeEq(hmacHex(raw, secret), signature)) {
      const record: WebhookEventRecord = {
        ...base,
        event_type: 'unverified',
        signature_valid: false,
        processed: 'REJECTED',
      };
      await ledger.append('webhook.recorded', record);
      return reply.status(401).send({ error: 'invalid_signature' });
    }

    // Verified — safe to parse now.
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
    } catch {
      // Signature valid but body not JSON: record without event semantics.
    }
    const eventType = typeof parsed['event'] === 'string' ? (parsed['event'] as string) : 'unknown';
    const linkedOrderId = extractOrderId(parsed);

    const seen = ledger.replay().webhookEvents.has(eventId);
    if (seen) {
      const dupCount = [...ledger.replay().webhookEvents.keys()].filter((k) =>
        k.startsWith(`${eventId}#dup`),
      ).length;
      const record: WebhookEventRecord = {
        ...base,
        event_id: `${eventId}#dup${dupCount > 0 ? dupCount + 1 : ''}`,
        event_type: eventType,
        signature_valid: true,
        processed: 'DUPLICATE',
        ...(linkedOrderId ? { linked_order_id: linkedOrderId } : {}),
      };
      await ledger.append('webhook.recorded', record);
      return reply.status(200).send({ status: 'duplicate' });
    }

    const record: WebhookEventRecord = {
      ...base,
      event_type: eventType,
      signature_valid: true,
      processed: 'PROCESSED',
      ...(linkedOrderId ? { linked_order_id: linkedOrderId } : {}),
    };
    await ledger.append('webhook.recorded', record);
    return reply.status(200).send({ status: 'processed' });
  });

  return app;
}

// Best-effort linkage; order of events is never assumed (F7).
function extractOrderId(parsed: Record<string, unknown>): string | undefined {
  const payload = parsed['payload'] as Record<string, unknown> | undefined;
  const payment = payload?.['payment'] as Record<string, unknown> | undefined;
  const paymentEntity = payment?.['entity'] as Record<string, unknown> | undefined;
  const order = payload?.['order'] as Record<string, unknown> | undefined;
  const orderEntity = order?.['entity'] as Record<string, unknown> | undefined;
  return (
    (paymentEntity?.['order_id'] as string | undefined) ?? (orderEntity?.['id'] as string | undefined)
  );
}
