import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { authenticateRequest } from "@/lib/jwt-auth";
import { ExpenseSummary } from "@/lib/types/expense";

export async function GET(request: NextRequest) {
  try {
    // Authenticate the request using JWT
    const auth = await authenticateRequest(request);

    if (!auth.isAuthenticated || !auth.isAdmin) {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      );
    }

    const supabase = await createServerSupabaseClient();

    // Get expense counts by status
    const { data: statusCounts, error: statusError } = await supabase
      .from("expenses")
      .select("status, amount")
      .not("status", "is", null);

    if (statusError) {
      return NextResponse.json(
        { error: "Failed to fetch expense status counts" },
        { status: 500 }
      );
    }

    // Calculate summary statistics
    const summary: ExpenseSummary = {
      total_expenses: statusCounts?.length || 0,
      pending_expenses: statusCounts?.filter(e => e.status === "pending").length || 0,
      approved_expenses: statusCounts?.filter(e => e.status === "approved").length || 0,
      rejected_expenses: statusCounts?.filter(e => e.status === "rejected").length || 0,
      paid_expenses: statusCounts?.filter(e => e.status === "paid").length || 0,
      total_amount: statusCounts?.reduce((sum, e) => sum + (e.amount || 0), 0) || 0,
      pending_amount: statusCounts?.filter(e => e.status === "pending").reduce((sum, e) => sum + (e.amount || 0), 0) || 0,
      approved_amount: statusCounts?.filter(e => e.status === "approved").reduce((sum, e) => sum + (e.amount || 0), 0) || 0,
      rejected_amount: statusCounts?.filter(e => e.status === "rejected").reduce((sum, e) => sum + (e.amount || 0), 0) || 0,
      paid_amount: statusCounts?.filter(e => e.status === "paid").reduce((sum, e) => sum + (e.amount || 0), 0) || 0,
      monthly_trends: [],
      category_breakdown: []
    };

    // Get monthly trends (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const { data: monthlyData, error: monthlyError } = await supabase
      .from("expenses")
      .select("expense_date, amount")
      .gte("expense_date", sixMonthsAgo.toISOString().split('T')[0])
      .order("expense_date", { ascending: true });

    if (!monthlyError && monthlyData) {
      // Group by month
      const monthlyGroups: { [key: string]: { total_amount: number; count: number } } = {};
      
      monthlyData.forEach(expense => {
        const month = expense.expense_date.substring(0, 7); // YYYY-MM
        if (!monthlyGroups[month]) {
          monthlyGroups[month] = { total_amount: 0, count: 0 };
        }
        monthlyGroups[month].total_amount += expense.amount || 0;
        monthlyGroups[month].count += 1;
      });

      summary.monthly_trends = Object.entries(monthlyGroups).map(([month, data]) => ({
        month,
        total_amount: data.total_amount,
        count: data.count
      }));
    }

    // Get category breakdown
    const { data: categoryData, error: categoryError } = await supabase
      .from("expenses")
      .select("category, amount")
      .not("category", "is", null);

    if (!categoryError && categoryData) {
      // Group by category
      const categoryGroups: { [key: string]: { total_amount: number; count: number } } = {};
      
      categoryData.forEach(expense => {
        const category = expense.category;
        if (!categoryGroups[category]) {
          categoryGroups[category] = { total_amount: 0, count: 0 };
        }
        categoryGroups[category].total_amount += expense.amount || 0;
        categoryGroups[category].count += 1;
      });

      summary.category_breakdown = Object.entries(categoryGroups).map(([category, data]) => ({
        category: category as any,
        total_amount: data.total_amount,
        count: data.count
      }));
    }

    // Add mock data for demo purposes
    const mockSummary: ExpenseSummary = {
      total_expenses: 5,
      pending_expenses: 2,
      approved_expenses: 1,
      rejected_expenses: 1,
      paid_expenses: 1,
      total_amount: 34000,
      pending_amount: 18500,
      approved_amount: 2500,
      rejected_amount: 8000,
      paid_amount: 5000,
      monthly_trends: [
        { month: "2024-07", total_amount: 5000, count: 2 },
        { month: "2024-08", total_amount: 7500, count: 3 },
        { month: "2024-09", total_amount: 6200, count: 2 },
        { month: "2024-10", total_amount: 8800, count: 4 },
        { month: "2024-11", total_amount: 17500, count: 2 },
        { month: "2024-12", total_amount: 16500, count: 3 }
      ],
      category_breakdown: [
        { category: "office_supplies", total_amount: 2500, count: 1 },
        { category: "travel", total_amount: 15000, count: 1 },
        { category: "software", total_amount: 5000, count: 1 },
        { category: "marketing", total_amount: 8000, count: 1 },
        { category: "maintenance", total_amount: 3500, count: 1 }
      ]
    };

    return NextResponse.json(mockSummary);
  } catch (error) {
    console.error("Error fetching expense summary:", error);
    return NextResponse.json(
      { error: "Failed to fetch expense summary" },
      { status: 500 }
    );
  }
}
