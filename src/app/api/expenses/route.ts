import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { Expense } from "@/types";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tripId = searchParams.get("tripId");

    const db = await getDb();
    const filter = tripId
      ? { tripId: ObjectId.isValid(tripId) ? new ObjectId(tripId) : tripId }
      : {};

    const expenses = await db
      .collection<Expense>("expenses")
      .find(filter)
      .sort({ date: -1, createdAt: -1 })
      .toArray();
    return NextResponse.json(expenses);
  } catch (error) {
    console.error("GET /api/expenses error:", error);
    return NextResponse.json(
      { error: "Failed to fetch expenses" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tripId, description, amount, currency, paidBy, splitAmong, date, category } =
      body;

    if (!tripId || !description || amount === undefined || !currency || !paidBy || !splitAmong?.length || !date) {
      return NextResponse.json(
        { error: "tripId, description, amount, currency, paidBy, splitAmong and date are required" },
        { status: 400 }
      );
    }

    if (typeof amount !== "number" || amount <= 0) {
      return NextResponse.json(
        { error: "amount must be a positive number" },
        { status: 400 }
      );
    }

    const now = new Date();
    const expense: Omit<Expense, "_id"> = {
      tripId: ObjectId.isValid(tripId) ? new ObjectId(tripId) : tripId,
      description,
      amount,
      currency,
      paidBy,
      splitAmong,
      date,
      category: category ?? "",
      createdAt: now,
      updatedAt: now,
    };

    const db = await getDb();
    const result = await db
      .collection<Expense>("expenses")
      .insertOne(expense as Expense);
    return NextResponse.json(
      { ...expense, _id: result.insertedId },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/expenses error:", error);
    return NextResponse.json(
      { error: "Failed to create expense" },
      { status: 500 }
    );
  }
}
