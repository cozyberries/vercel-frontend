import { NextRequest, NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createAdminSupabaseClient,
} from "@/lib/supabase-server";
import { authenticateRequest } from "@/lib/jwt-auth";
import {
  ExpenseCreate,
  ExpenseFilters,
  ExpenseStats,
} from "@/lib/types/expense";

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

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");
    const status = searchParams.get("status");
    const category = searchParams.get("category");
    const priority = searchParams.get("priority");
    const user_id = searchParams.get("user_id");
    const date_from = searchParams.get("date_from");
    const date_to = searchParams.get("date_to");
    const amount_min = searchParams.get("amount_min");
    const amount_max = searchParams.get("amount_max");
    const search = searchParams.get("search");

    let query = supabase
      .from("expenses")
      .select(
        `
        *,
        category_data:expense_categories(
          id,
          name,
          slug,
          display_name,
          description,
          color,
          icon,
          sort_order
        ),
        user:user_profiles(
          id,
          full_name,
          email
        )
      `
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    if (category && category !== "all") {
      query = query.eq("category", category);
    }

    if (priority && priority !== "all") {
      query = query.eq("priority", priority);
    }

    if (user_id) {
      query = query.eq("user_id", user_id);
    }

    if (date_from) {
      query = query.gte("expense_date", date_from);
    }

    if (date_to) {
      query = query.lte("expense_date", date_to);
    }

    if (amount_min) {
      query = query.gte("amount", parseFloat(amount_min));
    }

    if (amount_max) {
      query = query.lte("amount", parseFloat(amount_max));
    }

    if (search) {
      query = query.or(
        `title.ilike.%${search}%,description.ilike.%${search}%,vendor.ilike.%${search}%`
      );
    }

    const { data: expenses, error: expensesError } = await query;

    if (expensesError) {
      console.error("Supabase query error:", expensesError);
      return NextResponse.json(
        { error: `Failed to fetch expenses: ${expensesError.message}` },
        { status: 500 }
      );
    }

    // Add mock expenses for demo purposes
    const mockExpenses = [
      {
        id: "mock-expense-1",
        title: "Office Supplies Purchase",
        description: "Purchased stationery items for the office",
        amount: 2500,
        category: "office_supplies",
        priority: "medium",
        expense_date: "2024-11-15",
        vendor: "Stationery World",
        payment_method: "company_card",
        status: "approved",
        user_id: "mock-user-1",
        approved_by: "mock-admin-1",
        approved_at: "2024-11-16T10:30:00Z",
        created_at: "2024-11-15T14:20:00Z",
        updated_at: "2024-11-16T10:30:00Z",
        notes: "Monthly office supplies",
        tags: ["office", "supplies"],
        user: {
          id: "mock-user-1",
          email: "john.doe@company.com",
          full_name: "John Doe",
        },
        approver: {
          id: "mock-admin-1",
          email: "admin@company.com",
          full_name: "Admin User",
        },
      },
      {
        id: "mock-expense-2",
        title: "Business Travel - Mumbai",
        description: "Flight and hotel expenses for client meeting",
        amount: 15000,
        category: "travel",
        priority: "high",
        expense_date: "2024-11-20",
        vendor: "Travel Agency",
        payment_method: "company_card",
        status: "pending",
        user_id: "mock-user-2",
        created_at: "2024-11-20T09:15:00Z",
        updated_at: "2024-11-20T09:15:00Z",
        notes: "Client meeting in Mumbai",
        tags: ["travel", "client", "meeting"],
        user: {
          id: "mock-user-2",
          email: "jane.smith@company.com",
          full_name: "Jane Smith",
        },
      },
      {
        id: "mock-expense-3",
        title: "Software License Renewal",
        description: "Annual subscription for design software",
        amount: 5000,
        category: "software",
        priority: "medium",
        expense_date: "2024-11-25",
        vendor: "Adobe Inc.",
        payment_method: "direct_payment",
        status: "paid",
        user_id: "mock-user-3",
        approved_by: "mock-admin-1",
        approved_at: "2024-11-26T11:00:00Z",
        created_at: "2024-11-25T16:45:00Z",
        updated_at: "2024-11-27T14:30:00Z",
        notes: "Annual Adobe Creative Suite license",
        tags: ["software", "subscription", "design"],
        user: {
          id: "mock-user-3",
          email: "mike.wilson@company.com",
          full_name: "Mike Wilson",
        },
        approver: {
          id: "mock-admin-1",
          email: "admin@company.com",
          full_name: "Admin User",
        },
      },
      {
        id: "mock-expense-4",
        title: "Marketing Campaign Materials",
        description: "Printed materials for product launch campaign",
        amount: 8000,
        category: "marketing",
        priority: "high",
        expense_date: "2024-12-01",
        vendor: "Print Solutions",
        payment_method: "company_card",
        status: "rejected",
        user_id: "mock-user-4",
        approved_by: "mock-admin-1",
        approved_at: "2024-12-02T15:20:00Z",
        rejected_reason: "Budget exceeded for this quarter",
        created_at: "2024-12-01T10:30:00Z",
        updated_at: "2024-12-02T15:20:00Z",
        notes: "Product launch campaign materials",
        tags: ["marketing", "print", "campaign"],
        user: {
          id: "mock-user-4",
          email: "sarah.johnson@company.com",
          full_name: "Sarah Johnson",
        },
        approver: {
          id: "mock-admin-1",
          email: "admin@company.com",
          full_name: "Admin User",
        },
      },
      {
        id: "mock-expense-5",
        title: "Equipment Maintenance",
        description: "Servicing of office printers and computers",
        amount: 3500,
        category: "maintenance",
        priority: "low",
        expense_date: "2024-12-03",
        vendor: "Tech Services Ltd",
        payment_method: "reimbursement",
        status: "pending",
        user_id: "mock-user-1",
        created_at: "2024-12-03T13:15:00Z",
        updated_at: "2024-12-03T13:15:00Z",
        notes: "Quarterly equipment maintenance",
        tags: ["maintenance", "equipment", "quarterly"],
        user: {
          id: "mock-user-1",
          email: "john.doe@company.com",
          full_name: "John Doe",
        },
      },
    ];

    // Combine real expenses with mock expenses
    const allExpenses = [...(expenses || []), ...mockExpenses];

    return NextResponse.json({
      expenses: allExpenses,
      total: allExpenses.length,
    });
  } catch (error) {
    console.error("Error fetching expenses:", error);
    return NextResponse.json(
      { error: "Failed to fetch expenses" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate the request using JWT
    const auth = await authenticateRequest(request);

    if (!auth.isAuthenticated || !auth.isAdmin) {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      );
    }

    const supabase = createAdminSupabaseClient();

    const body: ExpenseCreate = await request.json();

    // Validate required fields
    if (
      !body.title ||
      typeof body.amount !== "number" ||
      !body.category ||
      !body.expense_date
    ) {
      return NextResponse.json(
        {
          error:
            "Title, amount, category, and expense date are required fields",
        },
        { status: 400 }
      );
    }

    // Validate amount
    if (body.amount <= 0) {
      return NextResponse.json(
        { error: "Amount must be greater than 0" },
        { status: 400 }
      );
    }

    // Get category_id if category is provided
    let categoryId = body.category_id;
    if (!categoryId && body.category) {
      const { data: categoryData } = await supabase
        .from("expense_categories")
        .select("id")
        .eq("name", body.category)
        .eq("is_active", true)
        .single();

      categoryId = categoryData?.id;
    }

    // Prepare data for insertion
    const expenseData = {
      title: body.title,
      description: body.description || null,
      amount: body.amount,
      category: body.category,
      category_id: categoryId,
      priority: body.priority || "medium",
      expense_date: body.expense_date,
      vendor: body.vendor || null,
      payment_method: body.payment_method,
      receipt_url: body.receipt_url || null,
      notes: body.notes || null,
      tags: body.tags || [],
      user_id: auth.userId,
      status: "pending",
    };

    const { data, error } = await supabase
      .from("expenses")
      .insert([expenseData])
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { error: `Failed to create expense: ${error.message}` },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "No data returned from database" },
        { status: 500 }
      );
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error("Error creating expense:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
