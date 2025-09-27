import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import type {
  ProductReviewsResponse,
  ReviewWithUser,
  ProductRatingStats,
} from "@/lib/types/review";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/products/[id]/reviews - Get reviews for a specific product
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: productId } = await params;
    const supabase = await createServerSupabaseClient();

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "10");
    const offset = parseInt(searchParams.get("offset") || "0");
    const sortBy = searchParams.get("sortBy") || "newest"; // newest, oldest, highest, lowest

    // Validate product exists (optional check - comment out if products table doesn't exist)
    // const { data: product, error: productError } = await supabase
    //   .from("products")
    //   .select("id")
    //   .eq("id", productId)
    //   .single();

    // if (productError) {
    //   return NextResponse.json(
    //     { error: "Product not found" },
    //     { status: 404 }
    //   );
    // }

    // Build query for reviews
    let query = supabase
      .from("reviews")
      .select(
        `
        *,
        user:auth.users!user_id(
          id,
          email,
          raw_user_meta_data
        )
      `
      )
      .eq("product_id", productId)
      .eq("status", "approved") // Only show approved reviews
      .range(offset, offset + limit - 1);

    // Apply sorting
    switch (sortBy) {
      case "newest":
        query = query.order("created_at", { ascending: false });
        break;
      case "oldest":
        query = query.order("created_at", { ascending: true });
        break;
      case "highest":
        query = query.order("rating", { ascending: false });
        break;
      case "lowest":
        query = query.order("rating", { ascending: true });
        break;
      default:
        query = query.order("created_at", { ascending: false });
    }

    const { data: reviews, error: reviewsError } = await query;

    if (reviewsError) {
      console.error("Error fetching product reviews:", reviewsError);

      // Check if the error is because the reviews table doesn't exist
      if (reviewsError.message?.includes('relation "reviews" does not exist')) {
        return NextResponse.json(
          {
            error:
              "Reviews table not found. Please run the database setup script.",
            details: "The reviews table needs to be created in your database.",
          },
          { status: 500 }
        );
      }

      return NextResponse.json(
        { error: "Failed to fetch reviews" },
        { status: 500 }
      );
    }

    // Get total count for pagination
    const { count } = await supabase
      .from("reviews")
      .select("*", { count: "exact", head: true })
      .eq("product_id", productId)
      .eq("status", "approved");

    const totalItems = count || 0;
    const totalPages = Math.ceil(totalItems / limit);
    const currentPage = Math.floor(offset / limit) + 1;

    // Get product rating statistics using the database function
    const { data: statsData, error: statsError } = await supabase.rpc(
      "get_product_rating_stats",
      { product_uuid: productId }
    );

    let stats: ProductRatingStats = {
      average_rating: 0,
      total_reviews: 0,
      rating_distribution: {
        "5": 0,
        "4": 0,
        "3": 0,
        "2": 0,
        "1": 0,
      },
    };

    if (statsError) {
      console.error("Error fetching rating stats:", statsError);
      // If the function doesn't exist, we'll use default stats
      // This allows the API to work even if the function isn't created yet
    } else if (statsData && statsData.length > 0) {
      const stat = statsData[0];
      stats = {
        average_rating: parseFloat(stat.average_rating) || 0,
        total_reviews: stat.total_reviews || 0,
        rating_distribution:
          stat.rating_distribution || stats.rating_distribution,
      };
    }

    const response: ProductReviewsResponse = {
      reviews: reviews as ReviewWithUser[],
      stats,
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
    console.error("Error fetching product reviews:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
