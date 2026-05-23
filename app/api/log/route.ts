import { MongoClient } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

// Reuse MongoDB client across calls (lazy init)
let client: MongoClient | null = null;
let clientPromise: Promise<MongoClient> | null = null;

function getClient(): Promise<MongoClient> {
  if (client) return Promise.resolve(client);
  if (!clientPromise) {
    clientPromise = MongoClient.connect(process.env.MONGODB_URI ?? "");
  }
  return clientPromise.then((c) => {
    client = c;
    return c;
  });
}

export async function POST(request: NextRequest) {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      console.error("MONGODB_URI not configured — skipping log write");
      return NextResponse.json({
        success: false,
        failedStep: "config",
        error: "DB not configured",
      });
    }

    const body = await request.json();
    const { wallIncline, climberHeight, climberWeight, joints, holds, analysis } = body;

    const sessionId = crypto.randomUUID();

    const dbName = process.env.MONGODB_DB || "cruxman";
    const mongo = await getClient();
    const db = mongo.db(dbName);

    const doc = {
      sessionId,
      createdAt: new Date(),
      wallIncline,
      climberHeight,
      climberWeight,
      holds,
      joints,
      analysis,
    };

    await db.collection("sessions").insertOne(doc);

    console.log("MongoDB log inserted successfully:", sessionId);
    return NextResponse.json({ success: true, sessionId });
  } catch (error: any) {
    const payload = {
      success: false,
      failedStep: "insert",
      error: error?.message ?? String(error),
    };
    console.error("MongoDB logging error:", payload);
    return NextResponse.json(payload);
  }
}