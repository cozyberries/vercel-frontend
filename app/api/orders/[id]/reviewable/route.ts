import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { OrderReviewableItem } from "@/lib/types/review";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
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

    // Get the order and verify ownership
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .eq('user_id', user.id)
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: "Order not found or access denied" },
        { status: 404 }
      );
    }

    // Check if order is delivered
    if (order.status !== 'delivered') {
      return NextResponse.json(
        { error: "Reviews can only be added for delivered orders" },
        { status: 403 }
      );
    }

    // Get existing reviews for this order
    const { data: existingReviews, error: reviewsError } = await supabase
      .from('reviews')
      .select('product_id, id, rating, title, comment, status, created_at')
      .eq('order_id', orderId)
      .eq('user_id', user.id);

    if (reviewsError) {
      console.error('Error fetching existing reviews:', reviewsError);
      return NextResponse.json(
        { error: "Failed to fetch existing reviews" },
        { status: 500 }
      );
    }

    // Create a map of existing reviews by product_id
    const existingReviewsMap = new Map();
    (existingReviews || []).forEach(review => {
      existingReviewsMap.set(review.product_id, review);
    });

    // Process order items to create reviewable items
    const reviewableItems: OrderReviewableItem[] = [];
    
    for (const item of order.items) {
      const productId = item.id;
      
      // Check if user can review this product
      const { data: canReview, error: canReviewError } = await supabase
        .rpc('can_user_review_product', {
          user_uuid: user.id,
          order_uuid: orderId,
          product_uuid: productId
        });

      if (canReviewError) {
        console.error('Error checking review eligibility:', canReviewError);
        continue;
      }

      // Get product details
      const { data: product, error: productError } = await supabase
        .from('products')
        .select(`
          id,
          name,
          product_images(
            id,
            storage_path,
            is_primary,
            display_order
          )
        `)
        .eq('id', productId)
        .single();

      if (productError) {
        console.error('Error fetching product:', productError);
        continue;
      }

      // Get primary product image
      let productImage;
      if (product.product_images && product.product_images.length > 0) {
        const primaryImage = product.product_images.find((img: any) => img.is_primary) || product.product_images[0];
        if (primaryImage && primaryImage.storage_path) {
          productImage = `/${primaryImage.storage_path}`;
        }
      }

      const existingReview = existingReviewsMap.get(productId);

      reviewableItems.push({
        product_id: productId,
        product_name: product.name,
        product_image: productImage,
        quantity: item.quantity,
        price: item.price,
        can_review: canReview,
        existing_review: existingReview ? {
          id: existingReview.id,
          rating: existingReview.rating,
          title: existingReview.title,
          comment: existingReview.comment,
          status: existingReview.status,
          created_at: existingReview.created_at,
        } : undefined,
      });
    }

    return NextResponse.json({ items: reviewableItems });
  } catch (error) {
    console.error('Error in order reviewable items GET:', error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
