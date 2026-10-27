import mongoose from "mongoose";

// Strip credentials from anything that might contain a connection string.
export const redact = (msg) => String(msg).replace(/(mongodb(?:\+srv)?:\/\/)[^@\s/]+@/gi, "$1***@");

export const isDbReady = () => mongoose.connection.readyState === 1;

export async function connectDB(uri) {
  mongoose.set("strictQuery", true);
  mongoose.connection.on("disconnected", () => console.warn("[db] disconnected"));
  mongoose.connection.on("reconnected", () => console.log("[db] reconnected"));
  mongoose.connection.on("error", (e) => console.error("[db] error:", redact(e.message)));

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000, maxPoolSize: 10 });
  } catch (err) {
    const e = new Error(redact(err.message));
    e.name = "DatabaseConnectionError";
    throw e;
  }
  console.log(`[db] connected to database "${mongoose.connection.name}"`);
}

export async function disconnectDB() {
  await mongoose.disconnect();
}
