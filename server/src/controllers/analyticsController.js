import { Visitor, VisitorDay, DailyStat } from "../models/Analytics.js";
import { dayKey, isBot, isVisitorId, hashVisitorId } from "../lib/analytics.js";

// POST /api/analytics/visit  { vid }  -> always 204. One call per storefront page view. Stores only: a hash of the random browser id, the day,
// and a per-day page-view counter. No IP address, no user agent, no page path, no personal data. Bots and invalid ids are ignored.
export async function recordVisit(req, res) {
  const vid = req.validated.body.vid;
  if (isVisitorId(vid) && !isBot(req.get("user-agent"))) {
    const day = dayKey(), hash = hashVisitorId(vid);
    const upsert = (Model, filter, update) => Model.updateOne(filter, update, { upsert: true }).catch((e) => { if (e?.code !== 11000) throw e; }); // 11000 = a parallel identical request won the race
    await Promise.all([
      upsert(Visitor, { hash }, { $setOnInsert: { hash, firstSeenDay: day } }),
      upsert(VisitorDay, { day, hash }, { $setOnInsert: { day, hash } }),
      upsert(DailyStat, { day }, { $inc: { pageViews: 1 } }),
    ]);
  }
  res.status(204).end();
}

// Used by the admin dashboard.
export async function visitorStats() {
  const today = dayKey();
  const start = (n) => dayKey(new Date(Date.now() - (n - 1) * 86_400_000));
  const uniqueSince = async (from) => (await VisitorDay.aggregate([{ $match: { day: { $gte: from } } }, { $group: { _id: "$hash" } }, { $count: "n" }]))[0]?.n || 0;
  const viewsSince = async (from) => (await DailyStat.aggregate([{ $match: { day: { $gte: from } } }, { $group: { _id: null, n: { $sum: "$pageViews" } } }]))[0]?.n || 0;
  const from14 = start(14);
  const [uToday, u7, u30, uAll, vToday, v7, v30, vAll, perDayU, perDayV] = await Promise.all([
    uniqueSince(today), uniqueSince(start(7)), uniqueSince(start(30)), Visitor.estimatedDocumentCount(),
    viewsSince(today), viewsSince(start(7)), viewsSince(start(30)), viewsSince("0000-00-00"),
    VisitorDay.aggregate([{ $match: { day: { $gte: from14 } } }, { $group: { _id: "$day", n: { $sum: 1 } } }]),
    DailyStat.find({ day: { $gte: from14 } }).select("day pageViews").lean(),
  ]);
  return {
    today, visitors: { today: uToday, last7: u7, last30: u30, allTime: uAll }, pageViews: { today: vToday, last7: v7, last30: v30, allTime: vAll },
    perDayVisitors: perDayU, perDayViews: perDayV.map((r) => ({ _id: r.day, n: r.pageViews })),
  };
}
