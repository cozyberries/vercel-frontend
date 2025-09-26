import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { ReviewFilters, ReviewResponse } from "@/lib/types/review";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    
    // Get the current user from Supabase session
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const filters: ReviewFilters = {
      product_id: searchParams.get('product_id') || undefined,
      user_id: searchParams.get('user_id') || undefined,
      order_id: searchParams.get('order_id') || undefined,
      status: (searchParams.get('status') as any) || 'approved',
      rating: searchParams.get('rating') ? parseInt(searchParams.get('rating')!) : undefined,
      is_verified_purchase: searchParams.get('is_verified_purchase') === 'true' ? true : 
                           searchParams.get('is_verified_purchase') === 'false' ? false : undefined,
      page: parseInt(searchParams.get('page') || '1'),
      limit: Math.min(parseInt(searchParams.get('limit') || '20'), 50),
      sort_by: (searchParams.get('sort_by') as any) || 'created_at',
      sort_order: (searchParams.get('sort_order') as any) || 'desc',
    };

    // Build query
    let query = supabase
      .from('reviews')
      .select(`
        *,
        review_images(
          id,
          storage_path,
          display_order
        ),
        review_votes(
          id,
          user_id,
          is_helpful
        )
      `);

    // Apply filters
    if (filters.product_id) {
      query = query.eq('product_id', filters.product_id);
    }
    
    if (filters.user_id) {
      query = query.eq('user_id', filters.user_id);
    }
    
    if (filters.order_id) {
      query = query.eq('order_id', filters.order_id);
    }
    
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    
    if (filters.rating) {
      query = query.eq('rating', filters.rating);
    }
    
    if (filters.is_verified_purchase !== undefined) {
      query = query.eq('is_verified_purchase', filters.is_verified_purchase);
    }

    // Apply sorting
    const sortColumn = filters.sort_by === 'helpful_votes' ? 'helpful_votes' : 
                      filters.sort_by === 'rating' ? 'rating' : 'created_at';
    query = query.order(sortColumn, { ascending: filters.sort_order === 'asc' });

    // Apply pagination
    const offset = (filters.page! - 1) * filters.limit!;
    query = query.range(offset, offset + filters.limit! - 1);

    const { data: reviews, error, count } = await query;

    if (error) {
      console.error('Error fetching reviews:', error);
      return NextResponse.json(
        { error: "Failed to fetch reviews" },
        { status: 500 }
      );
    }

    // Process reviews to add image URLs and filter user's own votes
    const processedReviews = (reviews || []).map((review: any) => ({
      ...review,
      images: (review.review_images || [])
        .filter((img: any) => img.storage_path)
        .map((img: any) => ({
          ...img,
          url: `/${img.storage_path}`,
        }))
        .sort((a: any, b: any) => (a.display_order || 0) - (b.display_order || 0)),
      // Only show votes for other users' reviews, not the reviewer's own votes
      votes: review.user_id === user.id ? [] : (review.review_votes || []),
    }));

    // Calculate pagination info
    const totalItems = count || 0;
    const totalPages = Math.ceil(totalItems / filters.limit!);
    const hasNextPage = filters.page! < totalPages;
    const hasPrevPage = filters.page! > 1;

    const response: ReviewResponse = {
      reviews: processedReviews,
      pagination: {
        currentPage: filters.page!,
        totalPages,
        totalItems,
        itemsPerPage: filters.limit!,
        hasNextPage,
        hasPrevPage,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in reviews GET:', error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    
    // Get the current user from Supabase session
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const order_id = formData.get('order_id') as string;
    const product_id = formData.get('product_id') as string;
    const rating = parseInt(formData.get('rating') as string);
    const title = formData.get('title') as string;
    const comment = formData.get('comment') as string;
    const images = formData.getAll('images') as File[];

    // Validate required fields
    if (!order_id || !product_id || !rating) {
      return NextResponse.json(
        { error: "Order ID, product ID, and rating are required" },
        { status: 400 }
      );
    }

    if (rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: "Rating must be between 1 and 5" },
        { status: 400 }
      );
    }

    // Check if user can review this product from this order
    const { data: canReview, error: canReviewError } = await supabase
      .rpc('can_user_review_product', {
        user_uuid: user.id,
        order_uuid: order_id,
        product_uuid: product_id
      });

    if (canReviewError || !canReview) {
      return NextResponse.json(
        { error: "You cannot review this product from this order" },
        { status: 403 }
      );
    }

    // Create the review
    const { data: review, error: reviewError } = await supabase
      .from('reviews')
      .insert({
        user_id: user.id,
        order_id,
        product_id,
        rating,
        title: title || null,
        comment: comment || null,
        status: 'pending',
        is_verified_purchase: true,
      })
      .select()
      .single();

    if (reviewError) {
      console.error('Error creating review:', reviewError);
      return NextResponse.json(
        { error: "Failed to create review" },
        { status: 500 }
      );
    }

    // Handle image uploads if any
    if (images && images.length > 0) {
      const imageUploadPromises = images.map(async (image, index) => {
        if (image.size === 0) return null;

        // Generate unique filename
        const fileExtension = image.name.split('.').pop();
        const fileName = `review-${review.id}-${index + 1}-${Date.now()}.${fileExtension}`;
        const filePath = `reviews/${fileName}`;

        // Convert File to ArrayBuffer
        const arrayBuffer = await image.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        // Upload to Supabase Storage
        const { error: uploadError } = await supabase.storage
          .from('review-images')
          .upload(filePath, uint8Array, {
            contentType: image.type,
            upsert: false
          });

        if (uploadError) {
          console.error('Error uploading review image:', uploadError);
          return null;
        }

        // Save image record to database
        const { error: imageError } = await supabase
          .from('review_images')
          .insert({
            review_id: review.id,
            storage_path: filePath,
            display_order: index,
          });

        if (imageError) {
          console.error('Error saving review image record:', imageError);
          return null;
        }

        return {
          storage_path: filePath,
          display_order: index,
          url: `/${filePath}`,
        };
      });

      const uploadedImages = await Promise.all(imageUploadPromises);
      review.images = uploadedImages.filter(img => img !== null);
    }

    return NextResponse.json({ review }, { status: 201 });
  } catch (error) {
    console.error('Error in reviews POST:', error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
