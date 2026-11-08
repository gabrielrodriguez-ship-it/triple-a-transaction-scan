import { createLookup } from '../../lib/lookup.mjs';
import { createHandler } from '../../lib/handler.mjs';
const service = createLookup();
export default createHandler(service.lookup);
export const config = { path:'/api/lookup', rateLimit: { windowLimit:30, windowSize:60, aggregateBy:['ip','domain'] } };
