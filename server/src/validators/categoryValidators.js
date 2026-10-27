import { z } from "zod";
import { boolString } from "./common.js";

export const listCategoriesQuery = z.object({
  navbar: boolString.optional(),
  homepage: boolString.optional(),
});
