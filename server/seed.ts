import { supabase } from './supabase';
import { MOCK_CARDS } from '../src/lib/mocks';

async function seed() {
  console.log('Seeding Supabase...');

  // 0. Check current state
  const { data: existingCards } = await supabase.from('cards').select('*');
  console.log(`Current DB has ${existingCards?.length} cards.`);
  if (existingCards?.length && existingCards.length > 0) {
      console.log('Sample existing card:', existingCards[0]);
  }

  // 1. Settings
  const { error: settingsError } = await supabase
    .from('settings')
    .upsert({ id: 1, cooldown_interval: 30 });

  if (settingsError) console.error('Error seeding settings:', settingsError);
  else console.log('Settings seeded.');

  // Clear existing cards
  // Note: This requires a policy allowing deletion or service role key
  const { error: deleteError } = await supabase.from('cards').delete().neq('last4', '0000'); // Delete all where last4 != 0000 (effectively all)
  if (deleteError) console.error('Error clearing cards:', deleteError);
  else console.log('Cleared existing cards.');

  // Map MOCK_CARDS to DB structure (camelCase to snake_case if needed, but our DB matches mostly)
  // The MOCK_CARDS in src/lib/mocks.ts have `last_used` as string, Supabase expects timestamptz (string is fine)
  
  const cardsToInsert = MOCK_CARDS.map(card => ({
      // Remove ID to let Supabase generate it or keep it if you want fixed IDs
      // For this seed, let's keep consistent IDs if possible, but UUIDs might clash if not valid UUIDs.
      // MOCK_CARDS ids are 'card-1', which are not valid UUIDs. Let's remove them.
      slash_card_id: card.slash_card_id,
      pan: card.pan,
      last4: card.last4,
      brand: card.brand,
      exp_month: card.exp_month,
      exp_year: card.exp_year,
      created_by: card.created_by,
      labels: card.labels,
      last_used: card.last_used,
      usage_count: card.usage_count,
      excluded_until: card.excluded_until,
      active: card.active,
      created_at: card.created_at
  }));

  const { error: cardsError } = await supabase.from('cards').insert(cardsToInsert);
  
  if (cardsError) console.error('Error seeding cards:', cardsError);
  else console.log(`Seeded ${cardsToInsert.length} cards.`);

  console.log('Done.');
}

seed();
