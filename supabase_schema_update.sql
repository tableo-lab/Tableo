-- Run this single line in your Supabase SQL Editor to support Menu Images:

ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS image_url TEXT;
