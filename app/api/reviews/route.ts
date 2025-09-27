import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import type {
  CreateReviewRequest,
  UpdateReviewRequest,
  ReviewResponse,
  ReviewsResponse,
  ProductReviewsResponse,
  ReviewWithUser,
  ProductRatingStats,
} from "@/lib/types/review";

// POST /api/reviews - Create a new review
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    // Get the current user from Supabase session
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const body: CreateReviewRequest = await request.json();
    const { order_id, product_id, rating, title, comment } = body;

    // Validate required fields
    if (!order_id || !product_id || !rating) {
      return NextResponse.json(
        { error: "Order ID, Product ID, and rating are required" },
        { status: 400 }
      );
    }

    // Validate rating range
    if (rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: "Rating must be between 1 and 5" },
        { status: 400 }
      );
    }

    // Check if order exists and is delivered
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, status, user_id, items")
      .eq("id", order_id)
      .eq("user_id", user.id)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (order.status !== "delivered") {
      return NextResponse.json(
        { error: "Reviews can only be created for delivered orders" },
        { status: 400 }
      );
    }

    // Check if product exists in the order
    const orderItems = order.items as any[];
    const productInOrder = orderItems.find((item) => item.id === product_id);

    if (!productInOrder) {
      return NextResponse.json(
        { error: "Product not found in this order" },
        { status: 400 }
      );
    }

    // Check if review already exists for this user, order, and product
    const { data: existingReview } = await supabase
      .from("reviews")
      .select("id")
      .eq("user_id", user.id)
      .eq("order_id", order_id)
      .eq("product_id", product_id)
      .single();

    if (existingReview) {
      return NextResponse.json(
        { error: "Review already exists for this product in this order" },
        { status: 409 }
      );
    }

    // Create the review
    const { data: review, error: reviewError } = await supabase
      .from("reviews")
      .insert({
        user_id: user.id,
        order_id,
        product_id,
        rating,
        title: title || null,
        comment: comment || null,
        status: "pending", // Reviews start as pending for moderation
      })
      .select()
      .single();

    if (reviewError) {
      console.error("Error creating review:", reviewError);
      console.error("Review data:", {
        user_id: user.id,
        order_id,
        product_id,
        rating,
        title,
        comment,
      });
      return NextResponse.json(
        { error: "Failed to create review", details: reviewError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ review });
  } catch (error) {
    console.error("Error in review creation:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET /api/reviews - Get user's reviews
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    // Get the current user from Supabase session
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "10");
    const offset = parseInt(searchParams.get("offset") || "0");
    const status = searchParams.get("status");

    let query = supabase
      .from("reviews")
      .select(
        `
        *,
        user:user_profiles!reviews_user_id_fkey(
          id,
          full_name,
          email
        )
      `
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    const { data: reviews, error: reviewsError } = await query;

    if (reviewsError) {
      console.error("Error fetching reviews:", reviewsError);
      return NextResponse.json(
        { error: "Failed to fetch reviews" },
        { status: 500 }
      );
    }

    // Get total count for pagination
    let countQuery = supabase
      .from("reviews")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);

    if (status && status !== "all") {
      countQuery = countQuery.eq("status", status);
    }

    const { count } = await countQuery;

    const totalItems = count || 0;
    const totalPages = Math.ceil(totalItems / limit);
    const currentPage = Math.floor(offset / limit) + 1;

    const response: ReviewsResponse = {
      reviews: reviews as ReviewWithUser[],
      pagination: {
        currentPage,
        totalPages,
        totalItems,
        itemsPerPage: limit,
        hasNextPage: currentPage < totalPages,
        hasPrevPage: currentPage > 1,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching reviews:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
