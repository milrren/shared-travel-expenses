import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { Trip } from "@/types";

export async function GET() {
  try {
    const db = await getDb();
    const trips = await db
      .collection<Trip>("trips")
      .find({})
      .sort({ createdAt: -1 })
      .toArray();
    return NextResponse.json(trips);
  } catch (error) {
    console.error("GET /api/trips error:", error);
    return NextResponse.json(
      { error: "Failed to fetch trips" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, startDate, endDate, participants } = body;

    if (!name || !startDate || !participants?.length) {
      return NextResponse.json(
        { error: "name, startDate and participants are required" },
        { status: 400 }
      );
    }

    const now = new Date();
    const trip: Omit<Trip, "_id"> = {
      name,
      description: description ?? "",
      startDate,
      endDate: endDate ?? "",
      participants,
      createdAt: now,
      updatedAt: now,
    };

    const db = await getDb();
    const result = await db.collection<Trip>("trips").insertOne(trip as Trip);
    return NextResponse.json(
      { ...trip, _id: result.insertedId },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/trips error:", error);
    return NextResponse.json(
      { error: "Failed to create trip" },
      { status: 500 }
    );
  }
}
