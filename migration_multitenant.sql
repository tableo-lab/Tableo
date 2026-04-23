-- 1. Create restaurants table
CREATE TABLE IF NOT EXISTS restaurants (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Insert default restaurant for existing data
-- Password is 'password'. Change this via Super Admin panel later!
INSERT INTO restaurants (username, password_hash, name) 
VALUES ('default_owner', '$2a$10$e.w9B4G7fGfC0/9iH.i8N.zO11vK8PIn3K9lI3X71A6tO2mI7C0eK', 'Main Restaurant')
ON CONFLICT (username) DO NOTHING;

-- 3. Add restaurant_id to tables and set default to 1 (the one we just created)
ALTER TABLE tables ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE CASCADE DEFAULT 1;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE CASCADE DEFAULT 1;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE CASCADE DEFAULT 1;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE CASCADE DEFAULT 1;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE CASCADE DEFAULT 1;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE CASCADE DEFAULT 1;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE CASCADE DEFAULT 1;

-- 4. Drop the default value constraint so future inserts explicitly require it
ALTER TABLE tables ALTER COLUMN restaurant_id DROP DEFAULT;
ALTER TABLE categories ALTER COLUMN restaurant_id DROP DEFAULT;
ALTER TABLE menu_items ALTER COLUMN restaurant_id DROP DEFAULT;
ALTER TABLE orders ALTER COLUMN restaurant_id DROP DEFAULT;
ALTER TABLE order_items ALTER COLUMN restaurant_id DROP DEFAULT;
ALTER TABLE bills ALTER COLUMN restaurant_id DROP DEFAULT;

-- 5. Fix the Settings table Primary Key
ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_pkey;
ALTER TABLE settings ADD PRIMARY KEY (restaurant_id, key);
