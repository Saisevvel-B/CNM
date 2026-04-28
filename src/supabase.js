import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pgexdnuvxigemeutnnbq.supabase.co'; // paste yours here
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBnZXhkbnV2eGlnZW1ldXRubmJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNTM4NTcsImV4cCI6MjA5MjkyOTg1N30.EzXsapPRcvc4YYoLND-2IXnswItCXDsloqK3-TmosP4';                    // paste yours here

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Generate a unique ID per browser (acts as "user identity")
export function getUserId() {
  let id = localStorage.getItem('community_user_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('community_user_id', id);
  }
  return id;
}