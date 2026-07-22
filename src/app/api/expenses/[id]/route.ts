import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { Expense } from "@/types";

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
    const { description, amount, currency, paidBy, splitAmong, date, category } = body;

    if (amount !== undefined && (typeof amount !== "number" || amount <= 0)) {
      return NextResponse.json(
        { error: "amount must be a positive number" },
        { status: 400 }
      );
    }

    const db = await getDb();
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
