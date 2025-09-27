import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { ReviewUpdate } from "@/lib/types/review";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
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

    const { data: review, error } = await supabase
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
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
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

    // Check if user can view this review
    if (review.status !== 'approved' && review.user_id !== user.id) {
      return NextResponse.json(
        { error: "Review not found" },
        { status: 404 }
      );
    }

    // Process review to add image URLs and filter user's own votes
    const processedReview = {
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
    };

    return NextResponse.json({ review: processedReview });
  } catch (error) {
    console.error('Error in review GET:', error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
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

    // Check if review exists and user owns it
    const { data: existingReview, error: fetchError } = await supabase
      .from('reviews')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !existingReview) {
      return NextResponse.json(
        { error: "Review not found or access denied" },
        { status: 404 }
      );
    }

    // Check if review can be updated (only pending reviews)
    if (existingReview.status !== 'pending') {
      return NextResponse.json(
        { error: "Only pending reviews can be updated" },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const rating = formData.get('rating') ? parseInt(formData.get('rating') as string) : undefined;
    const title = formData.get('title') as string;
    const comment = formData.get('comment') as string;
    const images = formData.getAll('images') as File[];

    // Validate rating if provided
    if (rating !== undefined && (rating < 1 || rating > 5)) {
      return NextResponse.json(
        { error: "Rating must be between 1 and 5" },
        { status: 400 }
      );
    }

    // Prepare update data
    const updateData: any = {};
    if (rating !== undefined) updateData.rating = rating;
    if (title !== null) updateData.title = title || null;
    if (comment !== null) updateData.comment = comment || null;

    // Update the review
    const { data: review, error: updateError } = await supabase
      .from('reviews')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating review:', updateError);
      return NextResponse.json(
        { error: "Failed to update review" },
        { status: 500 }
      );
    }

    // Handle image updates if any
    if (images && images.length > 0) {
      // Delete existing images
      await supabase
        .from('review_images')
        .delete()
        .eq('review_id', id);

      // Upload new images
      const imageUploadPromises = images.map(async (image, index) => {
        if (image.size === 0) return null;

        // Generate unique filename
        const fileExtension = image.name.split('.').pop();
        const fileName = `review-${id}-${index + 1}-${Date.now()}.${fileExtension}`;
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
            review_id: id,
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

    return NextResponse.json({ review });
  } catch (error) {
    console.error('Error in review PATCH:', error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
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

    // Check if review exists and user owns it
    const { data: existingReview, error: fetchError } = await supabase
      .from('reviews')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !existingReview) {
      return NextResponse.json(
        { error: "Review not found or access denied" },
        { status: 404 }
      );
    }

    // Check if review can be deleted (only pending reviews)
    if (existingReview.status !== 'pending') {
      return NextResponse.json(
        { error: "Only pending reviews can be deleted" },
        { status: 403 }
      );
    }

    // Delete review images from storage
    const { data: images } = await supabase
      .from('review_images')
      .select('storage_path')
      .eq('review_id', id);

    if (images && images.length > 0) {
      const filePaths = images.map(img => img.storage_path);
      await supabase.storage
        .from('review-images')
        .remove(filePaths);
    }

    // Delete the review (cascade will handle related records)
    const { error: deleteError } = await supabase
      .from('reviews')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Error deleting review:', deleteError);
      return NextResponse.json(
        { error: "Failed to delete review" },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: "Review deleted successfully" });
  } catch (error) {
    console.error('Error in review DELETE:', error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
