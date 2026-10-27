import { wrap } from "./wrap.js";
import { parseLookupInput } from "../lib/orderAccessService.js";

export const lookupBody = wrap(parseLookupInput); // POST /api/orders/lookup
