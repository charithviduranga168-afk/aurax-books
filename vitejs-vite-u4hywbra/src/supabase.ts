import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://pvxubbkbyvruceoofpkt.supabase.co';
const supabaseKey = 'sb_publishable_sE-nZGslYHmbcb5wLeRpSA_zRU2R94Z';

export const supabase = createClient(supabaseUrl, supabaseKey);
