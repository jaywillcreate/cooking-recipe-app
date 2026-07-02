import { C } from '@/lib/tokens';

export function Spinner({ size = 44, color = C.rust }: { size?: number; color?: string }) {
  const border = Math.max(2.5, size / 11);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: `${border}px solid ${color}33`,
        borderTopColor: color,
        animation: 'emberSpin .8s linear infinite',
      }}
    />
  );
}
