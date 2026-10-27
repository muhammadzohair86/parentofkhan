export const ORDER_STATUSES = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"];

// Allowed moves. "processing" = being printed. delivered and cancelled are final.
const NEXT = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};
export const allowedNext = (from) => NEXT[from] || [];
export const canTransition = (from, to) => allowedNext(from).includes(to);
