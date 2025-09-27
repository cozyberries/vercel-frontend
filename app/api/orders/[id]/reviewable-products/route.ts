import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/orders/[id]/reviewable-products - Get products that can be reviewed for an order
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id: orderId } = await params;
    const supabase = await createServerSupabaseClient();
    
    // Get the current user from Supabase session
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Get the order
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, status, user_id, items")
      .eq("id", orderId)
      .eq("user_id", user.id)
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }

    // Only allow reviews for delivered orders
    if (order.status !== 'delivered') {
      return NextResponse.json({
        order_id: orderId,
        status: order.status,
        items: [],
        message: "Reviews can only be created for delivered orders"
      });
    }

    const orderItems = order.items as any[];

    // Get existing reviews for this order
    const { data: existingReviews, error: reviewsError } = await supabase
      .from("reviews")
      .select("id, product_id")
      .eq("order_id", orderId)
      .eq("user_id", user.id);

    if (reviewsError) {
      console.error("Error fetching existing reviews:", reviewsError);
      return NextResponse.json(
        { error: "Failed to fetch existing reviews" },
        { status: 500 }
      );
    }

    // Create a map of existing reviews by product ID
    const existingReviewsMap = new Map(
      existingReviews?.map(review => [review.product_id, review.id]) || []
    );

    // Process order items to include review status
    const reviewableItems = orderItems.map(item => ({
      id: item.id,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      image: item.image,
      has_review: existingReviewsMap.has(item.id),
      review_id: existingReviewsMap.get(item.id) || undefined,
    }));

    return NextResponse.json({
      order_id: orderId,
      status: order.status,
      items: reviewableItems,
    });
    
  } catch (error) {
    console.error("Error fetching reviewable products:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
