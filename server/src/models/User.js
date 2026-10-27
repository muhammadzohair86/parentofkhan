import mongoose from "mongoose";
import { ROLES, ALL_PERMISSIONS } from "../lib/permissions.js";

export { ROLES };

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false }, // never loaded unless explicitly requested
    // Set only by the backend: customers sign up as "customer"; "admin" (sub-admin) accounts are created by the
    // master/team managers; "master_admin" comes only from the bootstrap script. No public endpoint can set it.
    role: { type: String, enum: ROLES, default: "customer" },
    // Sub-admin permissions (see lib/permissions.js). Ignored for customers; the master has everything implicitly.
    permissions: { type: [{ type: String, enum: ALL_PERMISSIONS }], default: [] },
    // false = cannot sign in and existing sessions stop working.
    active: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// At most ONE master admin can ever exist (enforced by the database, not just by code).
userSchema.index({ role: 1 }, { unique: true, partialFilterExpression: { role: "master_admin" } });

export const User = mongoose.models.User || mongoose.model("User", userSchema);
