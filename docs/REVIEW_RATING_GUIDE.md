# Review and Rating Feature Guide

This guide explains the implementation of the review and rating feature for the e-commerce application.

## Overview

The review and rating system allows customers to:

- Add reviews and ratings for products they've purchased
- Upload images with their reviews
- Vote on helpfulness of other reviews
- View product ratings and review summaries

## Features

### 1. Review Creation

- Only customers who have received delivered orders can review products
- Reviews include rating (1-5 stars), title, comment, and optional images
- Reviews start in "pending" status and can be approved by admins
- Users can update their pending reviews

### 2. Image Upload

- Support for up to 5 images per review
- Images are stored in Supabase Storage
- File size limit: 5MB per image
- Supported formats: PNG, JPG, JPEG

### 3. Review Management

- Users can edit/delete their own pending reviews
- Admins can approve/reject reviews
- Review helpfulness voting system

## Database Schema

### Tables Created

#### `reviews`

- Stores review content, ratings, and metadata
- Links to users, orders, and products
- Includes status tracking and helpfulness counts

#### `review_images`

- Stores review image references
- Links to reviews with display order

#### `review_votes`

- Stores helpfulness votes on reviews
- Prevents duplicate votes from same user

### Key Functions

- `calculate_product_rating()` - Calculates average rating and distribution
- `can_user_review_product()` - Validates review eligibility
- `update_review_helpfulness()` - Updates vote counts

## API Endpoints

### Reviews

- `GET /api/reviews` - List reviews with filters
- `POST /api/reviews` - Create new review
- `GET /api/reviews/[id]` - Get specific review
- `PATCH /api/reviews/[id]` - Update review
- `DELETE /api/reviews/[id]` - Delete review

### Review Voting

- `POST /api/reviews/[id]/vote` - Vote on review helpfulness
- `DELETE /api/reviews/[id]/vote` - Remove vote

### Product Reviews

- `GET /api/products/[id]/reviews` - Get product reviews and rating

### Order Reviewable Items

- `GET /api/orders/[id]/reviewable` - Get items that can be reviewed

## Frontend Components

### ReviewModal

- Modal for creating/editing reviews
- Star rating input
- Image upload with preview
- Form validation
- Support for multiple items in same order

### ProductReviews

- Displays product rating summary
- Shows review list with pagination
- Rating distribution visualization
- Review images display

### Orders Page Integration

- "Add Review" button for delivered orders
- Fetches reviewable items
- Opens review modal

## Usage

### For Customers

1. **Adding a Review**

   - Go to Orders page
   - Find a delivered order
   - Click "Add Review" button
   - Select product to review (if multiple items)
   - Fill in rating, title, comment
   - Upload images (optional)
   - Submit review

2. **Viewing Reviews**
   - Reviews appear on product pages
   - Shows average rating and distribution
   - Lists individual reviews with images

### For Admins

1. **Review Management**
   - Reviews start in "pending" status
   - Can be approved/rejected through admin panel
   - Only approved reviews are visible to public

## Security Features

### Row Level Security (RLS)

- Users can only view their own reviews (except approved ones)
- Users can only create reviews for their own delivered orders
- Users can only vote on approved reviews (not their own)
- Users can only update/delete their own pending reviews

### Validation

- Rating must be between 1-5
- Image file size and type validation
- Review eligibility verification
- Duplicate review prevention

## File Structure

```
database/schemas/
  └── reviews_schema.sql          # Database schema

lib/types/
  └── review.ts                   # TypeScript types

lib/services/
  └── reviews.ts                  # API service functions

components/
  ├── ReviewModal.tsx             # Review creation modal
  └── ProductReviews.tsx          # Review display component

app/api/
  ├── reviews/
  │   ├── route.ts                # Reviews CRUD
  │   ├── [id]/
  │   │   ├── route.ts            # Individual review
  │   │   └── vote/route.ts       # Review voting
  │   └── products/[id]/reviews/route.ts
  └── orders/[id]/reviewable/route.ts
```

## Setup Instructions

1. **Database Setup**

   ```sql
   -- Run the reviews schema
   \i database/schemas/reviews_schema.sql
   ```

2. **Storage Setup**

   - Create `review-images` bucket in Supabase Storage
   - Set appropriate RLS policies for the bucket

3. **Environment Variables**
   - Ensure Supabase configuration is properly set
   - Storage bucket permissions configured

## Testing

### Test Scenarios

1. **Review Creation**

   - Create review for delivered order
   - Verify validation (rating required)
   - Test image upload
   - Test multiple items in order

2. **Review Management**

   - Edit pending review
   - Delete pending review
   - Verify cannot edit approved review

3. **Review Display**

   - View product reviews
   - Test pagination
   - Verify rating calculation

4. **Security**
   - Test RLS policies
   - Verify user isolation
   - Test unauthorized access

## Future Enhancements

1. **Admin Review Management**

   - Admin panel for review approval
   - Bulk review operations
   - Review analytics

2. **Advanced Features**

   - Review moderation
   - Spam detection
   - Review sentiment analysis
   - Review notifications

3. **UI Improvements**
   - Review sorting options
   - Advanced filtering
   - Review search
   - Review templates

## Troubleshooting

### Common Issues

1. **Review Not Appearing**

   - Check if order status is "delivered"
   - Verify review status is "approved"
   - Check RLS policies

2. **Image Upload Fails**

   - Verify storage bucket exists
   - Check file size limits
   - Verify file type restrictions

3. **Rating Calculation Issues**
   - Check if reviews are approved
   - Verify database functions
   - Check for data consistency

### Debug Steps

1. Check browser console for errors
2. Verify API responses
3. Check database queries
4. Validate RLS policies
5. Test with different user accounts
