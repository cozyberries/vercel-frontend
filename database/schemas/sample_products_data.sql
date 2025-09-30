-- Simplified sample data insertion script for products with image arrays
-- This script adds sample products with images stored as JSON arrays in the products table

-- First, insert sample categories
INSERT INTO categories (id, name, slug, description) VALUES
('550e8400-e29b-41d4-a716-446655440001', 'Jhabla Shorts', 'jhabla-shorts', 'Comfortable shorts for babies'),
('550e8400-e29b-41d4-a716-446655440002', 'Jhabla', 'jhabla', 'Traditional baby clothing'),
('550e8400-e29b-41d4-a716-446655440003', 'Nappies', 'nappies', 'Essential baby diapers'),
('550e8400-e29b-41d4-a716-446655440004', 'New Born Essentials', 'new-born-essentials', 'Essential items for newborns')
ON CONFLICT (id) DO NOTHING;

-- Insert sample products with images as simple URL arrays
INSERT INTO products (id, name, description, price, slug, stock_quantity, is_featured, category_id, care_instructions, features, colors, sizes, images) VALUES
-- Jhabla Shorts Products
('660e8400-e29b-41d4-a716-446655440001', 'Cotton Jhabla Shorts - Blue', 'Soft cotton shorts perfect for active babies', 299.00, 'cotton-jhabla-shorts-blue', 50, true, '550e8400-e29b-41d4-a716-446655440001', 'Machine wash cold, tumble dry low', ARRAY['100% Cotton', 'Breathable', 'Soft'], ARRAY['Blue', 'Navy'], ARRAY['0-3M', '3-6M', '6-9M', '9-12M'], 
'[
  "https://aqvcyyhuqcjnhohaclib.supabase.co/storage/v1/object/sign/categories/jhabla_shorts_category.webp?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV81OWNhOGQyOC00MGM3LTQwOGEtYjZmOC04NjcxMmVmNzFhM2IiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjYXRlZ29yaWVzL2poYWJsYV9zaG9ydHNfY2F0ZWdvcnkud2VicCIsImlhdCI6MTc1OTIwODYwMywiZXhwIjoxNzkwNzQ0NjAzfQ.vc_6Lk343rig3oW4CwVTLfVo2JVWmOYZKr-7bXMtx2s",
  "https://aqvcyyhuqcjnhohaclib.supabase.co/storage/v1/object/sign/categories/jhabla_shorts_category.webp?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV81OWNhOGQyOC00MGM3LTQwOGEtYjZmOC04NjcxMmVmNzFhM2IiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjYXRlZ29yaWVzL2poYWJsYV9zaG9ydHNfY2F0ZWdvcnkud2VicCIsImlhdCI6MTc1OTIwODYwMywiZXhwIjoxNzkwNzQ0NjAzfQ.vc_6Lk343rig3oW4CwVTLfVo2JVWmOYZKr-7bXMtx2s",
  "https://aqvcyyhuqcjnhohaclib.supabase.co/storage/v1/object/sign/categories/jhabla_shorts_category.webp?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV81OWNhOGQyOC00MGM3LTQwOGEtYjZmOC04NjcxMmVmNzFhM2IiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjYXRlZ29yaWVzL2poYWJsYV9zaG9ydHNfY2F0ZWdvcnkud2VicCIsImlhdCI6MTc1OTIwODYwMywiZXhwIjoxNzkwNzQ0NjAzfQ.vc_6Lk343rig3oW4CwVTLfVo2JVWmOYZKr-7bXMtx2s"
]'::jsonb),

('660e8400-e29b-41d4-a716-446655440002', 'Cotton Jhabla Shorts - Pink', 'Comfortable pink shorts for little ones', 299.00, 'cotton-jhabla-shorts-pink', 45, true, '550e8400-e29b-41d4-a716-446655440001', 'Machine wash cold, tumble dry low', ARRAY['100% Cotton', 'Breathable', 'Soft'], ARRAY['Pink', 'Rose'], ARRAY['0-3M', '3-6M', '6-9M', '9-12M'],
'[
  "https://aqvcyyhuqcjnhohaclib.supabase.co/storage/v1/object/sign/categories/jhabla_shorts_category.webp?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV81OWNhOGQyOC00MGM3LTQwOGEtYjZmOC04NjcxMmVmNzFhM2IiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjYXRlZ29yaWVzL2poYWJsYV9zaG9ydHNfY2F0ZWdvcnkud2VicCIsImlhdCI6MTc1OTIwODYwMywiZXhwIjoxNzkwNzQ0NjAzfQ.vc_6Lk343rig3oW4CwVTLfVo2JVWmOYZKr-7bXMtx2s",
  "https://aqvcyyhuqcjnhohaclib.supabase.co/storage/v1/object/sign/categories/jhabla_shorts_category.webp?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV81OWNhOGQyOC00MGM3LTQwOGEtYjZmOC04NjcxMmVmNzFhM2IiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjYXRlZ29yaWVzL2poYWJsYV9zaG9ydHNfY2F0ZWdvcnkud2VicCIsImlhdCI6MTc1OTIwODYwMywiZXhwIjoxNzkwNzQ0NjAzfQ.vc_6Lk343rig3oW4CwVTLfVo2JVWmOYZKr-7bXMtx2s"
]'::jsonb),

-- Jhabla Products  
('660e8400-e29b-41d4-a716-446655440003', 'Traditional Jhabla - White', 'Classic white jhabla for special occasions', 399.00, 'traditional-jhabla-white', 30, true, '550e8400-e29b-41d4-a716-446655440002', 'Hand wash recommended, air dry', ARRAY['Traditional Design', 'Premium Cotton', 'Embroidered'], ARRAY['White', 'Cream'], ARRAY['0-3M', '3-6M', '6-9M', '9-12M'],
'[
  "https://aqvcyyhuqcjnhohaclib.supabase.co/storage/v1/object/sign/categories/jhabla_category.webp?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV81OWNhOGQyOC00MGM3LTQwOGEtYjZmOC04NjcxMmVmNzFhM2IiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjYXRlZ29yaWVzL2poYWJsYV9jYXRlZ29yeS53ZWJwIiwiaWF0IjoxNzU5MjA4NjIyLCJleHAiOjE3OTA3NDQ2MjJ9.SDYMapGhtVMu4kvNDJABR6Tk1wGd4dj0NaQOcJMYV7c",
  "https://aqvcyyhuqcjnhohaclib.supabase.co/storage/v1/object/sign/categories/jhabla_category.webp?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV81OWNhOGQyOC00MGM3LTQwOGEtYjZmOC04NjcxMmVmNzFhM2IiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjYXRlZ29yaWVzL2poYWJsYV9jYXRlZ29yeS53ZWJwIiwiaWF0IjoxNzU5MjA4NjIyLCJleHAiOjE3OTA3NDQ2MjJ9.SDYMapGhtVMu4kvNDJABR6Tk1wGd4dj0NaQOcJMYV7c",
  "https://aqvcyyhuqcjnhohaclib.supabase.co/storage/v1/object/sign/categories/jhabla_category.webp?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV81OWNhOGQyOC00MGM3LTQwOGEtYjZmOC04NjcxMmVmNzFhM2IiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjYXRlZ29yaWVzL2poYWJsYV9jYXRlZ29yeS53ZWJwIiwiaWF0IjoxNzU5MjA4NjIyLCJleHAiOjE3OTA3NDQ2MjJ9.SDYMapGhtVMu4kvNDJABR6Tk1wGd4dj0NaQOcJMYV7c"
]'::jsonb),

('660e8400-e29b-41d4-a716-446655440004', 'Traditional Jhabla - Yellow', 'Bright yellow jhabla for festive occasions', 399.00, 'traditional-jhabla-yellow', 25, false, '550e8400-e29b-41d4-a716-446655440002', 'Hand wash recommended, air dry', ARRAY['Traditional Design', 'Premium Cotton', 'Embroidered'], ARRAY['Yellow', 'Golden'], ARRAY['0-3M', '3-6M', '6-9M', '9-12M'],
'[
  "https://aqvcyyhuqcjnhohaclib.supabase.co/storage/v1/object/sign/categories/jhabla_category.webp?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV81OWNhOGQyOC00MGM3LTQwOGEtYjZmOC04NjcxMmVmNzFhM2IiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjYXRlZ29yaWVzL2poYWJsYV9jYXRlZ29yeS53ZWJwIiwiaWF0IjoxNzU5MjA4NjIyLCJleHAiOjE3OTA3NDQ2MjJ9.SDYMapGhtVMu4kvNDJABR6Tk1wGd4dj0NaQOcJMYV7c",
  "https://aqvcyyhuqcjnhohaclib.supabase.co/storage/v1/object/sign/categories/jhabla_category.webp?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV81OWNhOGQyOC00MGM3LTQwOGEtYjZmOC04NjcxMmVmNzFhM2IiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjYXRlZ29yaWVzL2poYWJsYV9jYXRlZ29yeS53ZWJwIiwiaWF0IjoxNzU5MjA4NjIyLCJleHAiOjE3OTA3NDQ2MjJ9.SDYMapGhtVMu4kvNDJABR6Tk1wGd4dj0NaQOcJMYV7c"
]'::jsonb),

-- Nappies Products
('660e8400-e29b-41d4-a716-446655440005', 'Premium Baby Nappies - Pack of 20', 'Ultra-absorbent nappies for all-day comfort', 599.00, 'premium-baby-nappies-pack-20', 100, true, '550e8400-e29b-41d4-a716-446655440003', 'Disposable, eco-friendly', ARRAY['Ultra Absorbent', 'Hypoallergenic', 'Wetness Indicator'], ARRAY['White'], ARRAY['Newborn', 'Small', 'Medium', 'Large'],
'[
  "https://aqvcyyhuqcjnhohaclib.supabase.co/storage/v1/object/sign/categories/nappies_category.webp?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV81OWNhOGQyOC00MGM3LTQwOGEtYjZmOC04NjcxMmVmNzFhM2IiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjYXRlZ29yaWVzL25hcHBpZXNfY2F0ZWdvcnkud2VicCIsImlhdCI6MTc1OTIwODYzNiwiZXhwIjoxNzkwNzQ0NjM2fQ.1woLmtxjvXhPltCeUkqVpZx2FFvAQ0kp_F3UGmPKzLk",
  "https://aqvcyyhuqcjnhohaclib.supabase.co/storage/v1/object/sign/categories/nappies_category.webp?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV81OWNhOGQyOC00MGM3LTQwOGEtYjZmOC04NjcxMmVmNzFhM2IiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjYXRlZ29yaWVzL25hcHBpZXNfY2F0ZWdvcnkud2VicCIsImlhdCI6MTc1OTIwODYzNiwiZXhwIjoxNzkwNzQ0NjM2fQ.1woLmtxjvXhPltCeUkqVpZx2FFvAQ0kp_F3UGmPKzLk",
  "https://aqvcyyhuqcjnhohaclib.supabase.co/storage/v1/object/sign/categories/nappies_category.webp?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV81OWNhOGQyOC00MGM3LTQwOGEtYjZmOC04NjcxMmVmNzFhM2IiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjYXRlZ29yaWVzL25hcHBpZXNfY2F0ZWdvcnkud2VicCIsImlhdCI6MTc1OTIwODYzNiwiZXhwIjoxNzkwNzQ0NjM2fQ.1woLmtxjvXhPltCeUkqVpZx2FFvAQ0kp_F3UGmPKzLk"
]'::jsonb),

('660e8400-e29b-41d4-a716-446655440006', 'Cloth Nappies - Organic Cotton', 'Reusable organic cotton nappies', 899.00, 'cloth-nappies-organic-cotton', 40, false, '550e8400-e29b-41d4-a716-446655440003', 'Machine wash warm, air dry', ARRAY['Organic Cotton', 'Reusable', 'Eco-friendly'], ARRAY['White', 'Natural'], ARRAY['One Size'],
'[
  "https://aqvcyyhuqcjnhohaclib.supabase.co/storage/v1/object/sign/categories/nappies_category.webp?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV81OWNhOGQyOC00MGM3LTQwOGEtYjZmOC04NjcxMmVmNzFhM2IiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjYXRlZ29yaWVzL25hcHBpZXNfY2F0ZWdvcnkud2VicCIsImlhdCI6MTc1OTIwODYzNiwiZXhwIjoxNzkwNzQ0NjM2fQ.1woLmtxjvXhPltCeUkqVpZx2FFvAQ0kp_F3UGmPKzLk",
  "https://aqvcyyhuqcjnhohaclib.supabase.co/storage/v1/object/sign/categories/nappies_category.webp?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV81OWNhOGQyOC00MGM3LTQwOGEtYjZmOC04NjcxMmVmNzFhM2IiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjYXRlZ29yaWVzL25hcHBpZXNfY2F0ZWdvcnkud2VicCIsImlhdCI6MTc1OTIwODYzNiwiZXhwIjoxNzkwNzQ0NjM2fQ.1woLmtxjvXhPltCeUkqVpZx2FFvAQ0kp_F3UGmPKzLk"
]'::jsonb),

-- New Born Essentials
('660e8400-e29b-41d4-a716-446655440007', 'Newborn Starter Kit', 'Complete essentials kit for newborns', 1299.00, 'newborn-starter-kit', 20, true, '550e8400-e29b-41d4-a716-446655440004', 'Various care instructions included', ARRAY['Complete Kit', 'Premium Quality', 'Gift Ready'], ARRAY['Mixed'], ARRAY['Newborn'],
'[
  "https://aqvcyyhuqcjnhohaclib.supabase.co/storage/v1/object/sign/categories/new_born_essentials_category.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV81OWNhOGQyOC00MGM3LTQwOGEtYjZmOC04NjcxMmVmNzFhM2IiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjYXRlZ29yaWVzL25ld19ib3JuX2Vzc2VudGlhbHNfY2F0ZWdvcnkuanBnIiwiaWF0IjoxNzU5MjA4Njc1LCJleHAiOjE3OTA3NDQ2NzV9.zJ5x3kBpD8iJ5koqBSYFOxqtKEpisVRkdBx1P1kz86Q",
  "https://aqvcyyhuqcjnhohaclib.supabase.co/storage/v1/object/sign/categories/new_born_essentials_category.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV81OWNhOGQyOC00MGM3LTQwOGEtYjZmOC04NjcxMmVmNzFhM2IiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjYXRlZ29yaWVzL25ld19ib3JuX2Vzc2VudGlhbHNfY2F0ZWdvcnkuanBnIiwiaWF0IjoxNzU5MjA4Njc1LCJleHAiOjE3OTA3NDQ2NzV9.zJ5x3kBpD8iJ5koqBSYFOxqtKEpisVRkdBx1P1kz86Q",
  "https://aqvcyyhuqcjnhohaclib.supabase.co/storage/v1/object/sign/categories/new_born_essentials_category.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV81OWNhOGQyOC00MGM3LTQwOGEtYjZmOC04NjcxMmVmNzFhM2IiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjYXRlZ29yaWVzL25ld19ib3JuX2Vzc2VudGlhbHNfY2F0ZWdvcnkuanBnIiwiaWF0IjoxNzU5MjA4Njc1LCJleHAiOjE3OTA3NDQ2NzV9.zJ5x3kBpD8iJ5koqBSYFOxqtKEpisVRkdBx1P1kz86Q"
]'::jsonb),

('660e8400-e29b-41d4-a716-446655440008', 'Baby Care Essentials Bundle', 'Essential care items for baby comfort', 799.00, 'baby-care-essentials-bundle', 35, false, '550e8400-e29b-41d4-a716-446655440004', 'Follow individual product instructions', ARRAY['Bundle Pack', 'Essential Items', 'Value Pack'], ARRAY['Mixed'], ARRAY['0-6M'],
'[
  "https://aqvcyyhuqcjnhohaclib.supabase.co/storage/v1/object/sign/categories/new_born_essentials_category.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV81OWNhOGQyOC00MGM3LTQwOGEtYjZmOC04NjcxMmVmNzFhM2IiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjYXRlZ29yaWVzL25ld19ib3JuX2Vzc2VudGlhbHNfY2F0ZWdvcnkuanBnIiwiaWF0IjoxNzU5MjA4Njc1LCJleHAiOjE3OTA3NDQ2NzV9.zJ5x3kBpD8iJ5koqBSYFOxqtKEpisVRkdBx1P1kz86Q",
  "https://aqvcyyhuqcjnhohaclib.supabase.co/storage/v1/object/sign/categories/new_born_essentials_category.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV81OWNhOGQyOC00MGM3LTQwOGEtYjZmOC04NjcxMmVmNzFhM2IiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjYXRlZ29yaWVzL25ld19ib3JuX2Vzc2VudGlhbHNfY2F0ZWdvcnkuanBnIiwiaWF0IjoxNzU5MjA4Njc1LCJleHAiOjE3OTA3NDQ2NzV9.zJ5x3kBpD8iJ5koqBSYFOxqtKEpisVRkdBx1P1kz86Q"
]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Example queries to work with the simplified image arrays:

-- 1. Get all products with their images
-- SELECT id, name, price, images FROM products;

-- 2. Get products with primary image (first image in array)
-- SELECT id, name, price, images->0 as primary_image FROM products;

-- 3. Get products by category with images
-- SELECT p.id, p.name, p.price, p.images, c.name as category_name
-- FROM products p
-- JOIN categories c ON p.category_id = c.id
-- WHERE c.slug = 'jhabla-shorts';

-- 4. Get featured products with images
-- SELECT id, name, price, images
-- FROM products 
-- WHERE is_featured = true
-- ORDER BY created_at DESC;

-- 5. Update a product's images (example)
-- UPDATE products 
-- SET images = '["https://example.com/image1.jpg", "https://example.com/image2.jpg"]'::jsonb
-- WHERE id = '660e8400-e29b-41d4-a716-446655440001';

-- 6. Add a new image to existing product
-- UPDATE products 
-- SET images = images || '"https://example.com/new-image.jpg"'::jsonb
-- WHERE id = '660e8400-e29b-41d4-a716-446655440001';

-- 7. Get products with image count
-- SELECT id, name, price, jsonb_array_length(images) as image_count FROM products;
