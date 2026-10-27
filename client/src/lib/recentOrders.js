// "Orders on this device": the private link (order reference + token) of orders this browser placed or looked up, kept in localStorage so the
// customer can reopen them without retyping anything. This is only a convenience: every page still loads the order from the server, so a
// missing or cleared entry loses nothing but the shortcut. No e-mail, address or order contents are stored.
const KEY = "pok_recent_orders_v1";
const MAX = 10;
const valid = (o) => o && /^POK-\d{6}-[A-Z0-9]{6}$/.test(o.orderNumber) && /^[0-9a-f-]{36}$/i.test(o.token);

export function getRecentOrders() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(list) ? list.filter(valid) : [];
  } catch { return []; }
}
export function rememberOrder(orderNumber, token) {
  try {
    const next = [{ orderNumber, token, at: new Date().toISOString() }, ...getRecentOrders().filter((o) => o.orderNumber !== orderNumber)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch { /* private mode / storage full: the shortcut just isn't saved */ }
}
export function forgetOrder(orderNumber) {
  try { localStorage.setItem(KEY, JSON.stringify(getRecentOrders().filter((o) => o.orderNumber !== orderNumber))); } catch { /* nothing to do */ }
}
