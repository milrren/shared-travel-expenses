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

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: "Invalid expense id" },
        { status: 400 }
      );
    }

    const db = await getDb();
    const expense = await db
      .collection<Expense>("expenses")
      .findOne({ _id: new ObjectId(id) });

    if (!expense) {
      return NextResponse.json(
        { error: "Expense not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(expense);
  } catch (error) {
    console.error("GET /api/expenses/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch expense" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: "Invalid expense id" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const {
      tripId,
      description,
      amount,
      currency,
      paidBy,
      splitAmong,
      date,
      category,
    } = body;

    if (tripId !== undefined) {
      return NextResponse.json(
        { error: "tripId cannot be changed" },
        { status: 400 }
      );
    }

    if (amount !== undefined && (typeof amount !== "number" || amount <= 0)) {
      return NextResponse.json(
        { error: "amount must be a positive number" },
        { status: 400 }
      );
    }

    if (splitAmong !== undefined && (!Array.isArray(splitAmong) || splitAmong.length === 0)) {
      return NextResponse.json(
        { error: "splitAmong must contain at least one participant" },
        { status: 400 }
      );
    }

    const db = await getDb();
    const existingExpense = await db
      .collection<Expense>("expenses")
      .findOne({ _id: new ObjectId(id) });

    if (!existingExpense) {
      return NextResponse.json(
        { error: "Expense not found" },
        { status: 404 }
      );
    }

    const associatedTripId = String(existingExpense.tripId);
    if (!ObjectId.isValid(associatedTripId)) {
      return NextResponse.json(
        { error: "Expense has invalid trip association" },
        { status: 400 }
      );
    }

    const trip = await db
      .collection<Trip>("trips")
      .findOne({ _id: new ObjectId(associatedTripId) });

    if (!trip) {
      return NextResponse.json(
        { error: "Associated trip not found" },
        { status: 404 }
      );
    }

    if (paidBy !== undefined && !trip.participants.includes(paidBy)) {
      return NextResponse.json(
        { error: "paidBy must be a participant of this trip" },
        { status: 400 }
      );
    }

    const effectiveAmount = amount ?? existingExpense.amount;
    const effectiveSplitAmong = splitAmong ?? existingExpense.splitAmong;

    if (!Array.isArray(effectiveSplitAmong) || effectiveSplitAmong.length === 0) {
      return NextResponse.json(
        { error: "splitAmong must contain at least one participant" },
        { status: 400 }
      );
    }

    const usingCustomSplit = effectiveSplitAmong.every((value: unknown) => isSplitShare(value));
    const usingLegacySplit = effectiveSplitAmong.every((value: unknown) => typeof value === "string");

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
      const participants = (effectiveSplitAmong as string[]).map((participant) => participant.trim());

      if (participants.some((participant) => participant.length === 0)) {
        return NextResponse.json(
          { error: "splitAmong must contain non-empty participant names" },
          { status: 400 }
        );
      }

      if (participants.some((participant) => !trip.participants.includes(participant))) {
        return NextResponse.json(
          { error: "splitAmong contains participant(s) outside this trip" },
          { status: 400 }
        );
      }
    }

    if (usingCustomSplit) {
      const shares = effectiveSplitAmong as ExpenseSplitShare[];

      if (shares.some((share) => !trip.participants.includes(share.participant))) {
        return NextResponse.json(
          { error: "splitAmong contains participant(s) outside this trip" },
          { status: 400 }
        );
      }

      const sumCents = shares.reduce((sum, share) => sum + toCents(share.amount), 0);
      const totalCents = toCents(effectiveAmount);
      if (sumCents !== totalCents) {
        return NextResponse.json(
          { error: "sum of split amounts must match total expense amount" },
          { status: 400 }
        );
      }
    }

    const result = await db.collection<Expense>("expenses").findOneAndUpdate(
      { _id: new ObjectId(id) },
      {
        $set: {
          ...(description !== undefined && { description }),
          ...(amount !== undefined && { amount }),
          ...(currency !== undefined && { currency }),
          ...(paidBy !== undefined && { paidBy }),
          ...(splitAmong !== undefined && { splitAmong }),
          ...(date !== undefined && { date }),
          ...(category !== undefined && { category }),
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after" }
    );

    if (!result) {
      return NextResponse.json(
        { error: "Expense not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("PUT /api/expenses/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update expense" },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: "Invalid expense id" },
        { status: 400 }
      );
    }

    const db = await getDb();
    const result = await db
      .collection<Expense>("expenses")
      .deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { error: "Expense not found" },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/expenses/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete expense" },
      { status: 500 }
    );
  }
}
