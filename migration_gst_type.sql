-- Migration: Add GST taxpayer type to restaurants
-- Two GST registration types in India:
--   'regular'     → Can charge GST, issue Tax Invoice, claim ITC. Rate: 5% (standalone) or 18% (hotel ≥₹7500/night)
--   'composition' → Cannot charge GST, must issue Bill of Supply, no ITC. Fixed rate: 5% on turnover

ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS gst_type TEXT NOT NULL DEFAULT 'composition';
-- Valid values: 'composition', 'regular'
