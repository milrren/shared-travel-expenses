import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { Expense, ExpenseSplitShare, Trip } from "@/types";

function isSplitShare(value: unknown): value is ExpenseSplitShare {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.participant === "string" &&
    candidate.participant.trim().length > 0 &&
    typeof candidate.amount === "number" &&
    Number.isFinite(candidate.amount) &&
    candidate.amount > 0
  );
}

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

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

    if (
      !tripId ||
      !description ||
      amount === undefined ||
      !currency ||
      !paidBy ||
      !Array.isArray(splitAmong) ||
      splitAmong.length === 0 ||
      !date
    ) {
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

    const db = await getDb();
    const associatedTripId = ObjectId.isValid(tripId) ? new ObjectId(tripId) : tripId;
    const trip =
      associatedTripId instanceof ObjectId
        ? await db.collection<Trip>("trips").findOne({ _id: associatedTripId })
        : null;

    if (associatedTripId instanceof ObjectId && !trip) {
      return NextResponse.json(
        { error: "Associated trip not found" },
        { status: 404 }
      );
    }

    if (trip && !trip.participants.includes(paidBy)) {
      return NextResponse.json(
        { error: "paidBy must be a participant of this trip" },
        { status: 400 }
      );
    }

    const usingCustomSplit = splitAmong.every((value: unknown) => isSplitShare(value));
    const usingLegacySplit = splitAmong.every((value: unknown) => typeof value === "string");

    if (!usingCustomSplit && !usingLegacySplit) {
      return NextResponse.json(
        {
          error:
            "splitAmong must be either an array of participant names or an array of { participant, amount }",
        },
        { status: 400 }
      );
    }

    if (usingLegacySplit) {
      const participants = (splitAmong as string[]).map((participant) => participant.trim());
      if (participants.some((participant) => participant.length === 0)) {
        return NextResponse.json(
          { error: "splitAmong must contain non-empty participant names" },
          { status: 400 }
        );
      }

      if (trip && participants.some((participant) => !trip.participants.includes(participant))) {
        return NextResponse.json(
          { error: "splitAmong contains participant(s) outside this trip" },
          { status: 400 }
        );
      }
    }

    if (usingCustomSplit) {
      const shares = splitAmong as ExpenseSplitShare[];

      if (trip && shares.some((share) => !trip.participants.includes(share.participant))) {
        return NextResponse.json(
          { error: "splitAmong contains participant(s) outside this trip" },
          { status: 400 }
        );
      }

      const sumCents = shares.reduce((sum, share) => sum + toCents(share.amount), 0);
      const totalCents = toCents(amount);
      if (sumCents !== totalCents) {
        return NextResponse.json(
          { error: "sum of split amounts must match total expense amount" },
          { status: 400 }
        );
      }
    }

    const now = new Date();
    const expense: Omit<Expense, "_id"> = {
      tripId: associatedTripId,
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
