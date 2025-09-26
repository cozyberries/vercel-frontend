import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { authenticateRequest } from "@/lib/jwt-auth";
import { ExpenseUpdate } from "@/lib/types/expense";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const { data: expense, error } = await supabase
      .from("expenses")
      .select(`
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
        ),
        approver:user_profiles!expenses_approved_by_fkey(
          id,
          full_name,
          email
        )
      `)
      .eq("id", params.id)
      .single();

    if (error) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    return NextResponse.json(expense);
  } catch (error) {
    console.error("Error fetching expense:", error);
    return NextResponse.json(
      { error: "Failed to fetch expense" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const body: ExpenseUpdate = await request.json();

    // Validate amount if provided
    if (body.amount !== undefined && body.amount <= 0) {
      return NextResponse.json(
        { error: "Amount must be greater than 0" },
        { status: 400 }
      );
    }

    // Handle category updates
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

    // Prepare update data
    const updateData: any = { ...body };
    
    if (categoryId) {
      updateData.category_id = categoryId;
    }

    if (body.status === "approved") {
      updateData.approved_by = auth.userId;
      updateData.approved_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from("expenses")
      .update(updateData)
      .eq("id", params.id)
      .select(`
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
        ),
        approver:user_profiles!expenses_approved_by_fkey(
          id,
          full_name,
          email
        )
      `)
      .single();

    if (error) {
      return NextResponse.json(
        { error: `Failed to update expense: ${error.message}` },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error updating expense:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const { error } = await supabase
      .from("expenses")
      .delete()
      .eq("id", params.id);

    if (error) {
      return NextResponse.json(
        { error: `Failed to delete expense: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: "Expense deleted successfully" });
  } catch (error) {
    console.error("Error deleting expense:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
