import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { loadPhoto } from './images';
import type { CaseFormat, Quad } from './coverPhoto';

// Photo de jaquette prise sur le téléphone, envoyée à l'ordinateur (QR code, comme le
// scanner de codes-barres). Canal Supabase Realtime à nom aléatoire : rien n'est stocké,
// la photo ne fait que passer. Les messages étant limités en taille, la photo (réduite
// à 1 600 px, JPEG) part en morceaux, réassemblés sur l'ordinateur, qui accuse réception.

export const photoChannel = (link: string) => `photo-${link}`;
const PART = 90_000; // caractères base64 par message
const MAX_SIDE = 1600;

export interface ReceivedPhoto { image: HTMLCanvasElement; quad: Quad; format: CaseFormat }

// Présence : chacun annonce qui il est, et voit si l'autre est là
const devices = (channel: RealtimeChannel) => Object.values(channel.presenceState()).flat()
  .map((p) => (p as { device?: string }).device);

// Téléphone : rejoindre le canal, savoir si l'ordinateur attend, envoyer la photo
export function usePhotoSender(link: string) {
  const channel = useRef<RealtimeChannel | null>(null);
  const [computerReady, setComputerReady] = useState(false);
  const received = useRef(new Map<string, () => void>());

  useEffect(() => {
    const ch = supabase.channel(photoChannel(link), { config: { broadcast: { self: false, ack: true }, presence: { key: crypto.randomUUID() } } });
    channel.current = ch;
    ch.on('presence', { event: 'sync' }, () => setComputerReady(devices(ch).includes('computer')))
      .on('broadcast', { event: 'photo-received' }, ({ payload }) => {
        const id = String((payload as { id?: unknown } | undefined)?.id ?? '');
        received.current.get(id)?.();
      })
      .subscribe((status) => { if (status === 'SUBSCRIBED') ch.track({ device: 'phone' }); });
    return () => {
      ch.untrack();
      supabase.removeChannel(ch);
      channel.current = null;
    };
  }, [link]);

  // Envoie la photo ; vrai quand l'ordinateur l'a bien reçue (20 s au plus)
  async function send(image: HTMLCanvasElement, quad: Quad, format: CaseFormat, onProgress?: (done: number, total: number) => void): Promise<boolean> {
    const ch = channel.current;
    if (!ch) return false;
    const scale = Math.min(1, MAX_SIDE / Math.max(image.width, image.height));
    const small = document.createElement('canvas');
    small.width = Math.round(image.width * scale);
    small.height = Math.round(image.height * scale);
    const context = small.getContext('2d')!;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, small.width, small.height);
    const url = small.toDataURL('image/jpeg', 0.86);
    const data = url.slice(url.indexOf(',') + 1);
    const id = crypto.randomUUID();
    const parts = Math.ceil(data.length / PART);
    const scaledQuad = quad.map((p) => ({ x: p.x * scale, y: p.y * scale })) as Quad;

    const confirmed = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => { received.current.delete(id); resolve(false); }, 20_000);
      received.current.set(id, () => { clearTimeout(timer); received.current.delete(id); resolve(true); });
    });
    if (await ch.send({ type: 'broadcast', event: 'photo-start', payload: { id, parts, quad: scaledQuad, format } }) !== 'ok') return false;
    for (let i = 0; i < parts; i++) {
      const result = await ch.send({ type: 'broadcast', event: 'photo-part', payload: { id, index: i, data: data.slice(i * PART, (i + 1) * PART) } });
      if (result !== 'ok') return false;
      onProgress?.(i + 1, parts);
    }
    return confirmed;
  }

  return { computerReady, send };
}

// Ordinateur : attendre le téléphone, recevoir la photo morceau par morceau
export function usePhotoReceiver(link: string | null, onPhoto: (photo: ReceivedPhoto) => void) {
  const [phoneReady, setPhoneReady] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState('');
  const callback = useRef(onPhoto);
  callback.current = onPhoto;

  useEffect(() => {
    if (!link) return;
    const ch = supabase.channel(photoChannel(link), { config: { broadcast: { self: false, ack: true }, presence: { key: crypto.randomUUID() } } });
    let current: { id: string; parts: string[]; total: number; quad: Quad; format: CaseFormat } | null = null;
    ch.on('presence', { event: 'sync' }, () => setPhoneReady(devices(ch).includes('phone')))
      .on('broadcast', { event: 'photo-start' }, ({ payload }) => {
        const p = payload as { id: string; parts: number; quad: Quad; format: CaseFormat };
        if (!p?.id || !Number.isInteger(p.parts) || p.parts < 1 || p.parts > 200 || !Array.isArray(p.quad) || p.quad.length !== 4) return;
        current = { id: p.id, parts: new Array(p.parts), total: p.parts, quad: p.quad, format: (['cd', 'dvd', 'free'] as const).includes(p.format) ? p.format : 'free' };
        setError('');
        setProgress({ done: 0, total: p.parts });
      })
      .on('broadcast', { event: 'photo-part' }, async ({ payload }) => {
        const p = payload as { id: string; index: number; data: string };
        if (!current || p?.id !== current.id || !Number.isInteger(p.index) || p.index < 0 || p.index >= current.total || typeof p.data !== 'string') return;
        current.parts[p.index] = p.data;
        const done = current.parts.filter(Boolean).length;
        setProgress({ done, total: current.total });
        if (done < current.total) return;
        const { id, quad, format } = current;
        const base64 = current.parts.join('');
        current = null;
        try {
          const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
          const image = await loadPhoto(new Blob([bytes], { type: 'image/jpeg' }));
          await ch.send({ type: 'broadcast', event: 'photo-received', payload: { id } });
          setProgress(null);
          callback.current({ image, quad: quad.map((q) => ({ x: Number(q.x) || 0, y: Number(q.y) || 0 })) as Quad, format });
        } catch {
          setProgress(null);
          setError('photo');
        }
      })
      .subscribe((status) => { if (status === 'SUBSCRIBED') ch.track({ device: 'computer' }); });
    return () => {
      setPhoneReady(false);
      setProgress(null);
      ch.untrack();
      supabase.removeChannel(ch);
    };
  }, [link]);

  return { phoneReady, progress, failed: error !== '' };
}
