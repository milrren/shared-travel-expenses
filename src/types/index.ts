import { ObjectId } from "mongodb";

export interface Trip {
  _id?: ObjectId;
  name: string;
  description?: string;
  startDate: string;
  endDate?: string;
  participants: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ExpenseSplitShare {
  participant: string;
  amount: number;
}

export interface Expense {
  _id?: ObjectId;
  tripId: ObjectId | string;
  description: string;
  amount: number;
  currency: string;
  paidBy: string;
  splitAmong: string[] | ExpenseSplitShare[];
  date: string;
  category?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Balance {
  participant: string;
  owes: { to: string; amount: number; currency: string }[];
}
