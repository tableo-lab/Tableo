/**
 * Cleanup script to fix duplicate categories and uncategorized menu items
 * for the demo restaurant (restaurant_id = 3, username = demo)
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const RESTAURANT_ID = 3; // demo restaurant

async function cleanup() {
  console.log('🧹 Starting cleanup for restaurant_id:', RESTAURANT_ID);

  // 1. Delete ALL existing categories for this restaurant
  console.log('\n--- Deleting all old categories ---');
  const { error: delCatErr } = await supabase
    .from('categories')
    .delete()
    .eq('restaurant_id', RESTAURANT_ID);
  if (delCatErr) console.error('Error deleting categories:', delCatErr);
  else console.log('✅ Old categories deleted');

  // 2. Delete ALL existing menu items for this restaurant
  console.log('\n--- Deleting all old menu items ---');
  const { error: delItemErr } = await supabase
    .from('menu_items')
    .delete()
    .eq('restaurant_id', RESTAURANT_ID);
  if (delItemErr) console.error('Error deleting menu items:', delItemErr);
  else console.log('✅ Old menu items deleted');

  // 3. Create clean categories
  console.log('\n--- Creating clean categories ---');
  const categories = [
    { name: 'Starters', icon: '🥗', position: 1, active: 1, restaurant_id: RESTAURANT_ID },
    { name: 'Main Course', icon: '🍛', position: 2, active: 1, restaurant_id: RESTAURANT_ID },
    { name: 'Beverages', icon: '🥤', position: 3, active: 1, restaurant_id: RESTAURANT_ID },
    { name: 'Desserts', icon: '🍰', position: 4, active: 1, restaurant_id: RESTAURANT_ID },
  ];
  const { data: cats, error: catErr } = await supabase
    .from('categories')
    .insert(categories)
    .select();
  if (catErr) { console.error('Error creating categories:', catErr); return; }
  console.log('✅ Created categories:', cats.map(c => `${c.name} (id:${c.id})`).join(', '));

  // Map category names to IDs
  const catMap = {};
  cats.forEach(c => catMap[c.name] = c.id);

  // 4. Create menu items with proper category assignments
  console.log('\n--- Creating menu items ---');
  const items = [
    { name: 'Paneer Tikka', description: 'Marinated cottage cheese grilled to perfection with mint chutney', price: 299, is_veg: 1, available: 1, position: 1, category_id: catMap['Starters'], restaurant_id: RESTAURANT_ID },
    { name: 'Veg Spring Rolls', description: 'Crispy rolls stuffed with mixed vegetables', price: 199, is_veg: 1, available: 1, position: 2, category_id: catMap['Starters'], restaurant_id: RESTAURANT_ID },
    { name: 'Chicken Seekh Kebab', description: 'Spiced minced chicken skewers from the tandoor', price: 349, is_veg: 0, available: 1, position: 3, category_id: catMap['Starters'], restaurant_id: RESTAURANT_ID },
    { name: 'Chicken Biryani', description: 'Fragrant basmati rice layered with tender chicken and aromatic spices', price: 349, is_veg: 0, available: 1, position: 1, category_id: catMap['Main Course'], restaurant_id: RESTAURANT_ID },
    { name: 'Paneer Butter Masala', description: 'Rich and creamy tomato gravy with soft paneer cubes', price: 279, is_veg: 1, available: 1, position: 2, category_id: catMap['Main Course'], restaurant_id: RESTAURANT_ID },
    { name: 'Dal Makhani', description: 'Slow-cooked black lentils in a buttery tomato cream sauce', price: 249, is_veg: 1, available: 1, position: 3, category_id: catMap['Main Course'], restaurant_id: RESTAURANT_ID },
    { name: 'Butter Naan', description: 'Soft leavened bread brushed with butter from the tandoor', price: 59, is_veg: 1, available: 1, position: 4, category_id: catMap['Main Course'], restaurant_id: RESTAURANT_ID },
    { name: 'Mango Lassi', description: 'Refreshing yogurt smoothie blended with Alphonso mangoes', price: 129, is_veg: 1, available: 1, position: 1, category_id: catMap['Beverages'], restaurant_id: RESTAURANT_ID },
    { name: 'Masala Chai', description: 'Traditional spiced tea brewed with fresh herbs', price: 69, is_veg: 1, available: 1, position: 2, category_id: catMap['Beverages'], restaurant_id: RESTAURANT_ID },
    { name: 'Fresh Lime Soda', description: 'Zesty lime juice with sparkling soda, sweet or salty', price: 89, is_veg: 1, available: 1, position: 3, category_id: catMap['Beverages'], restaurant_id: RESTAURANT_ID },
    { name: 'Gulab Jamun', description: 'Soft milk dumplings soaked in rose-scented sugar syrup', price: 149, is_veg: 1, available: 1, position: 1, category_id: catMap['Desserts'], restaurant_id: RESTAURANT_ID },
    { name: 'Kulfi', description: 'Traditional Indian ice cream with pistachios and saffron', price: 129, is_veg: 1, available: 1, position: 2, category_id: catMap['Desserts'], restaurant_id: RESTAURANT_ID },
  ];

  const { data: menuItems, error: itemErr } = await supabase
    .from('menu_items')
    .insert(items)
    .select();
  if (itemErr) { console.error('Error creating menu items:', itemErr); return; }
  console.log('✅ Created', menuItems.length, 'menu items');
  menuItems.forEach(i => console.log(`   • ${i.name} - ₹${i.price} (cat_id: ${i.category_id})`));

  // 5. Verify tables exist
  console.log('\n--- Checking tables ---');
  const { data: tables } = await supabase
    .from('tables')
    .select('*')
    .eq('restaurant_id', RESTAURANT_ID);
  console.log('✅ Tables:', tables ? tables.map(t => `${t.name} (id:${t.id}, ${t.seats} seats)`).join(', ') : 'None');

  // 6. Verify settings
  console.log('\n--- Checking settings ---');
  const { data: settings } = await supabase
    .from('settings')
    .select('*')
    .eq('restaurant_id', RESTAURANT_ID);
  if (settings) {
    settings.forEach(s => console.log(`   ${s.key}: ${s.value}`));
  }

  console.log('\n🎉 Cleanup complete! Restaurant is ready for demo.');
  console.log('\n📋 Access Points:');
  console.log('   Super Admin:  http://localhost:3000/superadmin  (admin / superadmin)');
  console.log('   Owner Panel:  http://localhost:3000/owner       (demo / demo123)');
  console.log('   Kitchen:      http://localhost:3000/kitchen     (demo / demo123)');
  if (tables && tables.length > 0) {
    console.log('   Customer:     http://localhost:3000/table/' + tables[0].id);
  }
}

cleanup().catch(console.error);
