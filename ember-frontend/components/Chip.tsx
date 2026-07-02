'use client';
import { chipStyle } from '@/lib/tokens';

interface ChipProps {
  label: string;
  active: boolean;
  activeBg: string;
  onClick: () => void;
  small?: boolean;
}

/** A pill chip (single/multi-select) matching the prototype's chip(). */
export function Chip({ label, active, activeBg, onClick, small = true }: ChipProps) {
  return (
    <button style={chipStyle(active, activeBg, small)} onClick={onClick} type="button">
      {label}
    </button>
  );
}

/** A row of chips built from a list + selection predicate. */
export function ChipRow({
  items,
  isActive,
  activeBg,
  onPick,
  small = true,
  prefix = '',
}: {
  items: string[];
  isActive: (v: string) => boolean;
  activeBg: string;
  onPick: (v: string) => void;
  small?: boolean;
  prefix?: string;
}) {
  return (
    <>
      {items.map((v) => (
        <Chip key={v} label={prefix + v} active={isActive(v)} activeBg={activeBg} onClick={() => onPick(v)} small={small} />
      ))}
    </>
  );
}
