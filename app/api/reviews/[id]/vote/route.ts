import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { ReviewVoteRequest } from "@/lib/types/review";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: reviewId } = await params;
    const supabase = await createServerSupabaseClient();
    
    // Get the current user from Supabase session
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const body: ReviewVoteRequest = await request.json();
    const { is_helpful } = body;

    // Validate input
    if (typeof is_helpful !== 'boolean') {
      return NextResponse.json(
        { error: "is_helpful must be a boolean" },
        { status: 400 }
      );
    }

    // Check if review exists and is approved
    const { data: review, error: reviewError } = await supabase
      .from('reviews')
      .select('id, user_id, status')
      .eq('id', reviewId)
      .single();

    if (reviewError || !review) {
      return NextResponse.json(
        { error: "Review not found" },
        { status: 404 }
      );
    }

    if (review.status !== 'approved') {
      return NextResponse.json(
        { error: "Can only vote on approved reviews" },
        { status: 403 }
      );
    }

    // Check if user is trying to vote on their own review
    if (review.user_id === user.id) {
      return NextResponse.json(
        { error: "Cannot vote on your own review" },
        { status: 403 }
      );
    }

    // Check if user has already voted on this review
    const { data: existingVote, error: voteError } = await supabase
      .from('review_votes')
      .select('id, is_helpful')
      .eq('review_id', reviewId)
      .eq('user_id', user.id)
      .single();

    if (voteError && voteError.code !== 'PGRST116') {
      console.error('Error checking existing vote:', voteError);
      return NextResponse.json(
        { error: "Failed to check existing vote" },
        { status: 500 }
      );
    }

    let vote;
    if (existingVote) {
      // Update existing vote
      const { data: updatedVote, error: updateError } = await supabase
        .from('review_votes')
        .update({ is_helpful })
        .eq('id', existingVote.id)
        .select()
        .single();

      if (updateError) {
        console.error('Error updating vote:', updateError);
        return NextResponse.json(
          { error: "Failed to update vote" },
          { status: 500 }
        );
      }

      vote = updatedVote;
    } else {
      // Create new vote
      const { data: newVote, error: createError } = await supabase
        .from('review_votes')
        .insert({
          review_id: reviewId,
          user_id: user.id,
          is_helpful,
        })
        .select()
        .single();

      if (createError) {
        console.error('Error creating vote:', createError);
        return NextResponse.json(
          { error: "Failed to create vote" },
          { status: 500 }
        );
      }

      vote = newVote;
    }

    // Get updated review with new vote counts
    const { data: updatedReview, error: updatedReviewError } = await supabase
      .from('reviews')
      .select('helpful_votes, total_votes')
      .eq('id', reviewId)
      .single();

    if (updatedReviewError) {
      console.error('Error fetching updated review:', updatedReviewError);
    }

    return NextResponse.json({
      vote,
      review_stats: updatedReview || { helpful_votes: 0, total_votes: 0 }
    });
  } catch (error) {
    console.error('Error in review vote POST:', error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: reviewId } = await params;
    const supabase = await createServerSupabaseClient();
    
    // Get the current user from Supabase session
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Check if vote exists and user owns it
    const { data: existingVote, error: voteError } = await supabase
      .from('review_votes')
      .select('id')
      .eq('review_id', reviewId)
      .eq('user_id', user.id)
      .single();

    if (voteError || !existingVote) {
      return NextResponse.json(
        { error: "Vote not found" },
        { status: 404 }
      );
    }

    // Delete the vote
    const { error: deleteError } = await supabase
      .from('review_votes')
      .delete()
      .eq('id', existingVote.id);

    if (deleteError) {
      console.error('Error deleting vote:', deleteError);
      return NextResponse.json(
        { error: "Failed to delete vote" },
        { status: 500 }
      );
    }

    // Get updated review with new vote counts
    const { data: updatedReview, error: updatedReviewError } = await supabase
      .from('reviews')
      .select('helpful_votes, total_votes')
      .eq('id', reviewId)
      .single();

    if (updatedReviewError) {
      console.error('Error fetching updated review:', updatedReviewError);
    }

    return NextResponse.json({
      message: "Vote deleted successfully",
      review_stats: updatedReview || { helpful_votes: 0, total_votes: 0 }
    });
  } catch (error) {
    console.error('Error in review vote DELETE:', error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
