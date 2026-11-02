import { supabase } from '../../lib/supabase';

// Efface du stockage les jaquettes d'un jeu ou d'une version supprimés
export async function removeCovers(paths: string[] | null) {
  for (let i = 0; i < (paths?.length ?? 0); i += 100) {
    await supabase.storage.from('covers').remove(paths!.slice(i, i + 100));
  }
}
