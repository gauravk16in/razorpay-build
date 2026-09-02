import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Paise } from '../contracts/schemas.js';
import { seedCart, setPrice, toSnapshot, type CartState } from './cart.js';

const AdminPriceBody = z.object({ amount_paise: Paise }).strict();

// SYNTHETIC merchant fixture (PLAN.md D4). Caller binds the port; no listen()
// here so tests can use app.inject() without real sockets.
export function buildMerchantApp(opts?: {
  clock?: () => number;
  cart?: CartState;
}): FastifyInstance {
  const clock = opts?.clock ?? (() => Date.now());
  const cart = opts?.cart ?? seedCart();
  const app = Fastify({ logger: false });

  app.addHook('onSend', async (_req, reply) => {
    reply.header('x-rupeeproof-evidence', 'SYNTHETIC');
  });

  app.get('/merchant/cart', async () => toSnapshot(cart, clock()));

  app.post('/merchant/__admin__/price', async (req, reply) => {
    const parsed = AdminPriceBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_body', detail: parsed.error.issues });
    }
    setPrice(cart, parsed.data.amount_paise);
    return { ok: true, amount_paise: parsed.data.amount_paise };
  });

  return app;
}
