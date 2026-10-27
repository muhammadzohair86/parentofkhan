import { z } from "zod";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id.");
export const idParams = z.object({ id: objectId });
export const listSubscribersQuery = z.object({
  status: z.enum(["subscribed", "unsubscribed"]).optional(),
  q: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export const updateSubscriberBody = z.object({ status: z.enum(["subscribed", "unsubscribed"]) });
export const exportSubscribersQuery = z.object({
  status: z.enum(["subscribed", "unsubscribed"]).optional(),
  q: z.string().trim().min(1).max(100).optional(),
});
