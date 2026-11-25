// La pièce du collectionneur (lib/room.ts) : ses meubles et leur aspect. Gardée sur l'appareil
// pour s'afficher tout de suite, et avec le compte (profile.shelf_style) pour la retrouver
// partout — et la montrer aux visiteurs de sa collection publique. Chaque changement s'applique
// à l'instant et s'enregistre un court instant après (on essaie souvent plusieurs réglages).
import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { useAuth } from '../auth/AuthContext';
import { cleanRoom, startingRoom, type Room } from './room';

const SAVE_DELAY = 700;
const ROOM_KEY = 'carte-memoire:piece';

function remembered(): Room | null {
  try { return cleanRoom(JSON.parse(localStorage.getItem(ROOM_KEY) ?? 'null')); } catch { return null; }
}
function remember(room: Room) {
  try { localStorage.setItem(ROOM_KEY, JSON.stringify(room)); } catch { /* stockage indisponible */ }
}
// Ce qui part dans la base : un objet versionné (la base vérifie la forme et la taille)
export const roomValue = (room: Room) => ({ v: 2, meubles: room.meubles, exposition: room.exposition });

export function useRoom(consoles: { code: string; name: string }[]) {
  const { session } = useAuth();
  const userId = session?.user.id;
  // null : rien de réglé, la pièce de départ suit la collection (une bibliothèque par console)
  const [saved, setSaved] = useState<Room | null>(remembered);
  const pending = useRef<Room | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // La pièce du compte (si elle existe) l'emporte sur celle de l'appareil
  useEffect(() => {
    if (!userId) return;
    let active = true;
    supabase.from('profile').select('shelf_style').eq('id', userId).maybeSingle().then(({ data, error }) => {
      if (!active || error || pending.current) return;
      const room = cleanRoom(data?.shelf_style);
      if (!room) return;
      setSaved(room);
      remember(room);
    });
    return () => { active = false; };
  }, [userId]);

  // En quittant la page, ce qui attendait encore part tout de suite
  useEffect(() => () => {
    clearTimeout(timer.current);
    if (pending.current && userId) supabase.from('profile').update({ shelf_style: roomValue(pending.current) }).eq('id', userId).then(() => undefined);
  }, [userId]);

  function save(next: Room) {
    setSaved(next);
    remember(next);
    if (!userId) return;
    pending.current = next;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const value = pending.current;
      pending.current = null;
      // Sans la colonne (base pas encore à jour) ou hors ligne : la pièce reste sur l'appareil
      if (value) supabase.from('profile').update({ shelf_style: roomValue(value) }).eq('id', userId).then(() => undefined);
    }, SAVE_DELAY);
  }

  return { room: saved ?? startingRoom(consoles), save };
}
