'use client';
import { useCallback, useRef, useState } from 'react';
import { photoApi } from '@/lib/api';
import { C, mono } from '@/lib/tokens';
import { Spinner } from './Spinner';

interface Props {
  target: { kind: 'avatar' } | { kind: 'recipe'; recipeId: string };
  shape?: 'rect' | 'circle';
  height?: number | string;
  currentUrl?: string | null;
  fallbackUrl?: string | null; // shown (e.g. a stock food photo) when no user photo
  placeholder?: string;
  onUploaded: (url: string) => void;
}

const MAX = 6 * 1024 * 1024;

/**
 * Drag-and-drop / click image upload — replaces the prototype's image-slot.js.
 * Reads the file to a base64 data URL and POSTs it to /api/photos, which
 * validates and stores it, returning a CDN-ready URL.
 */
export function ImageUpload({ target, shape = 'rect', height = 260, currentUrl, fallbackUrl, placeholder, onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        setError('Use a JPEG, PNG or WebP image.');
        return;
      }
      if (file.size > MAX) {
        setError('Image must be under 6 MB.');
        return;
      }
      setBusy(true);
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('read failed'));
          reader.readAsDataURL(file);
        });
        const { url } = await photoApi.upload(dataUrl, target);
        onUploaded(url);
      } catch {
        setError('Upload failed — try again.');
      } finally {
        setBusy(false);
      }
    },
    [target, onUploaded],
  );

  const radius = shape === 'circle' ? '50%' : 0;
  const displayUrl = currentUrl || fallbackUrl;
  const bg = displayUrl
    ? `#e9dfcc url("${displayUrl}") center/cover no-repeat`
    : 'repeating-linear-gradient(45deg,#efe7d8,#efe7d8 14px,#e9dfcc 14px,#e9dfcc 28px)';

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) void handleFile(f);
      }}
      style={{
        width: '100%',
        height,
        background: bg,
        borderRadius: radius,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        outline: dragOver ? `2px dashed ${C.gold}` : 'none',
        outlineOffset: -6,
      }}
      title={placeholder || 'Add a photo'}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = '';
        }}
      />
      {busy ? (
        <Spinner size={shape === 'circle' ? 22 : 30} />
      ) : (
        !displayUrl && (
          <span style={{ fontFamily: mono, fontSize: shape === 'circle' ? 10 : 12, color: 'rgba(36,26,18,0.5)', textAlign: 'center', padding: 8 }}>
            {error || placeholder || 'Drop or click to add a photo'}
          </span>
        )
      )}
      {/* Persistent add/replace affordance over any image (rect only). */}
      {!busy && shape === 'rect' && displayUrl && (
        <span
          style={{
            position: 'absolute', bottom: 10, right: 10, fontSize: 12, fontWeight: 700,
            color: C.ink, background: 'rgba(255,255,255,0.9)', padding: '6px 12px', borderRadius: 999,
            boxShadow: '0 1px 4px rgba(0,0,0,.15)', pointerEvents: 'none',
          }}
        >
          {error ? error : currentUrl ? '📷 Replace photo' : '📷 Add your photo'}
        </span>
      )}
      {shape === 'circle' && currentUrl && error && (
        <span style={{ position: 'absolute', bottom: 6, fontSize: 10, color: C.error, background: '#fff9', padding: '2px 6px', borderRadius: 6 }}>{error}</span>
      )}
    </div>
  );
}
