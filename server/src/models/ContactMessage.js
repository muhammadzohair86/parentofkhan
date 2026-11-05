import mongoose from "mongoose";

export const MESSAGE_STATUSES = ["new", "read", "replied"];

const contactMessageSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    subject: { type: String, required: true, trim: true, maxlength: 150 },
    message: { type: String, required: true, trim: true, maxlength: 5000 },
    status: { type: String, enum: MESSAGE_STATUSES, default: "new", index: true },
  },
  { timestamps: true }
);
contactMessageSchema.index({ createdAt: -1 });

export const ContactMessage = mongoose.models.ContactMessage || mongoose.model("ContactMessage", contactMessageSchema);
