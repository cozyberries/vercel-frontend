import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { ProductRating, ReviewFilters, ReviewResponse } from "@/lib/types/review";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: productId } = await params;
    const supabase = await createServerSupabaseClient();
    
    // Get the current user from Supabase session (optional for public reviews)
    const { data: { user } } = await supabase.auth.getUser();

    const { searchParams } = new URL(request.url);
    const filters: ReviewFilters = {
      product_id: productId,
      status: 'approved',
      page: parseInt(searchParams.get('page') || '1'),
      limit: Math.min(parseInt(searchParams.get('limit') || '10'), 20),
      sort_by: (searchParams.get('sort_by') as any) || 'created_at',
      sort_order: (searchParams.get('sort_order') as any) || 'desc',
    };

    // Get product rating summary
    const { data: ratingData, error: ratingError } = await supabase
      .rpc('calculate_product_rating', { product_uuid: productId });

    if (ratingError) {
      console.error('Error calculating product rating:', ratingError);
    }

    // Get reviews for the product
    // Show approved reviews for everyone, plus pending reviews for the current user
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
      `)
      .eq('product_id', productId);

    // Apply status filter: show approved reviews for everyone, plus pending reviews for current user
    if (user) {
      query = query.or(`status.eq.approved,and(status.eq.pending,user_id.eq.${user.id})`);
    } else {
      query = query.eq('status', 'approved');
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
      console.error('Error fetching product reviews:', error);
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
      votes: review.user_id === user?.id ? [] : (review.review_votes || []),
    }));

    // Calculate pagination info
    const totalItems = count || 0;
    const totalPages = Math.ceil(totalItems / filters.limit!);
    const hasNextPage = filters.page! < totalPages;
    const hasPrevPage = filters.page! > 1;

    const response = {
      rating: ratingData?.[0] || {
        average_rating: 0,
        total_reviews: 0,
        rating_distribution: { '5': 0, '4': 0, '3': 0, '2': 0, '1': 0 }
      },
      reviews: {
        reviews: processedReviews,
        pagination: {
          currentPage: filters.page!,
          totalPages,
          totalItems,
          itemsPerPage: filters.limit!,
          hasNextPage,
          hasPrevPage,
        },
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in product reviews GET:', error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
