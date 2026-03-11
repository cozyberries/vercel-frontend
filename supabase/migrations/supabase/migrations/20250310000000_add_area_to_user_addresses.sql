-- Add area/locality column to user_addresses for pincode auto-fill

ALTER TABLE user_addresses
ADD COLUMN IF NOT EXISTS area text;

COMMENT ON COLUMN user_addresses.area IS 'Area or locality (e.g. post office area), often auto-filled from pincode lookup';