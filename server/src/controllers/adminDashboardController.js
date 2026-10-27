import { Product } from "../models/Product.js";
import { Category } from "../models/Category.js";
import { Order } from "../models/Order.js";
import { hasPermission } from "../lib/permissions.js";

// Real counts only, and only for the sections this admin may view.
export async function dashboard(req, res) {
  const u = req.user;
  const out = {};
  const jobs = [];
  if (hasPermission(u, "products.view")) {
    jobs.push(Promise.all([Product.countDocuments({ active: true }), Product.countDocuments({ active: false }), Product.countDocuments({ active: true, featured: true })])
      .then(([active, inactive, featured]) => { out.products = { active, inactive, featured }; }));
  }
  if (hasPermission(u, "categories.view")) {
    jobs.push(Promise.all([Category.countDocuments({}), Category.countDocuments({ active: true })]).then(([total, active]) => { out.categories = { total, active }; }));
  }
  if (hasPermission(u, "orders.view")) {
    jobs.push(Promise.all([
      Order.countDocuments({}),
      Order.countDocuments({ status: "pending" }),
      Order.countDocuments({ status: { $in: ["confirmed", "processing"] } }),
      Order.aggregate([{ $match: { "payment.status": "paid", "payment.environment": { $ne: "sandbox" }, status: { $ne: "cancelled" } } }, { $group: { _id: null, amount: { $sum: "$total" }, count: { $sum: 1 } } }]),
    ]).then(([total, pending, inProgress, paid]) => {
      // Revenue appears only when paid orders really exist. Safepay SANDBOX payments are test money, so they are never counted as revenue.
      out.orders = { total, pending, inProgress, revenue: paid[0] ? { paidOrders: paid[0].count, amount: Math.round(paid[0].amount * 100) / 100 } : null };
    }));
  }
  await Promise.all(jobs);
  res.json({ success: true, data: out });
}
