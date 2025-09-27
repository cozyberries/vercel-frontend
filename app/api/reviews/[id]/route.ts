import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { UpdateReviewRequest, ReviewResponse } from "@/lib/types/review";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/reviews/[id] - Get a specific review
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    
    // Get the current user from Supabase session
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { data: review, error: reviewError } = await supabase
      .from("reviews")
      .select(`
        *,
        user:user_profiles!reviews_user_id_fkey(
          id,
          full_name,
          email
        )
      `)
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (reviewError) {
      if (reviewError.code === "PGRST116") {
        return NextResponse.json(
          { error: "Review not found" },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: "Failed to retrieve review" },
        { status: 500 }
      );
    }

    return NextResponse.json({ review });
    
  } catch (error) {
    console.error("Error fetching review:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PUT /api/reviews/[id] - Update a review
export async function PUT(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    
    // Get the current user from Supabase session
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const body: UpdateReviewRequest = await request.json();
    const { rating, title, comment } = body;

    // Validate rating if provided
    if (rating !== undefined && (rating < 1 || rating > 5)) {
      return NextResponse.json(
        { error: "Rating must be between 1 and 5" },
        { status: 400 }
      );
    }

    // Check if review exists and belongs to user
    const { data: existingReview, error: fetchError } = await supabase
      .from("reviews")
      .select("id, status")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !existingReview) {
      return NextResponse.json(
        { error: "Review not found" },
        { status: 404 }
      );
    }

    // Only allow updates to pending reviews
    if (existingReview.status !== 'pending') {
      return NextResponse.json(
        { error: "Only pending reviews can be updated" },
        { status: 400 }
      );
    }

    // Update the review
    const updateData: any = {};
    if (rating !== undefined) updateData.rating = rating;
    if (title !== undefined) updateData.title = title;
    if (comment !== undefined) updateData.comment = comment;

    const { data: review, error: updateError } = await supabase
      .from("reviews")
      .update(updateData)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating review:", updateError);
      return NextResponse.json(
        { error: "Failed to update review" },
        { status: 500 }
      );
    }

    return NextResponse.json({ review });
    
  } catch (error) {
    console.error("Error updating review:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/reviews/[id] - Delete a review
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    
    // Get the current user from Supabase session
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Check if review exists and belongs to user
    const { data: existingReview, error: fetchError } = await supabase
      .from("reviews")
      .select("id, status")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !existingReview) {
      return NextResponse.json(
        { error: "Review not found" },
        { status: 404 }
      );
    }

    // Only allow deletion of pending reviews
    if (existingReview.status !== 'pending') {
      return NextResponse.json(
        { error: "Only pending reviews can be deleted" },
        { status: 400 }
      );
    }

    // Delete the review
    const { error: deleteError } = await supabase
      .from("reviews")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (deleteError) {
      console.error("Error deleting review:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete review" },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: "Review deleted successfully" });
    
  } catch (error) {
    console.error("Error deleting review:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
