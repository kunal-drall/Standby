// Accessible tooltip: shows on hover and keyboard focus (tap focuses on touch), positioned in a
// fixed layer clamped to the viewport so it never causes horizontal scroll.
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  tip: ReactNode;
  children: ReactNode;
  className?: string;
  /** Focusable by keyboard (default true). Set false when the child is already focusable. */
  focusable?: boolean;
};

export function Tip({ tip, children, className, focusable = true }: Props) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const id = useId();

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const a = anchor.current?.getBoundingClientRect();
    const b = bubble.current?.getBoundingClientRect();
    if (!a || !b) return;
    const vw = document.documentElement.clientWidth;
    const left = Math.max(8, Math.min(a.left + a.width / 2 - b.width / 2, vw - b.width - 8));
    const above = a.top - b.height - 8;
    const top = above >= 8 ? above : a.bottom + 8;
    setPos({ left, top });
  }, [open, tip]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  return (
    <span
      ref={anchor}
      className={className ? `tip ${className}` : 'tip'}
      tabIndex={focusable ? 0 : undefined}
      aria-describedby={open ? id : undefined}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false);
      }}
    >
      {children}
      {open &&
        createPortal(
          <span
            ref={bubble}
            role="tooltip"
            id={id}
            className="tip-bubble"
            style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: 'hidden' }}
          >
            {tip}
          </span>,
          document.body,
        )}
    </span>
  );
}
