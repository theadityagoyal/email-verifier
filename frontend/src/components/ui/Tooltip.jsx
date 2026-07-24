import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

/**
 * General-purpose Tooltip component using React Portal to avoid clipping.
 *
 * Features:
 * - Renders to document.body via portal (never clipped by overflow:hidden ancestors)
 * - Fade in/out animation (~150ms)
 * - Positioned above trigger element
 * - Keyboard accessible (focus/hover)
 * - Light/dark theme via CSS variables
 * - No external dependencies
 */
export default function Tooltip({
  children,
  content,
  position = 'top',
  delay = 150,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const timeoutRef = useRef(null);
  const contentRef = useRef(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !contentRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const contentRect = contentRef.current.getBoundingClientRect();

    let top, left;

    switch (position) {
      case 'top':
        top = triggerRect.top - contentRect.height - 8;
        left = triggerRect.left + (triggerRect.width - contentRect.width) / 2;
        break;
      case 'bottom':
        top = triggerRect.bottom + 8;
        left = triggerRect.left + (triggerRect.width - contentRect.width) / 2;
        break;
      case 'left':
        top = triggerRect.top + (triggerRect.height - contentRect.height) / 2;
        left = triggerRect.left - contentRect.width - 8;
        break;
      case 'right':
        top = triggerRect.top + (triggerRect.height - contentRect.height) / 2;
        left = triggerRect.right + 8;
        break;
      default:
        top = triggerRect.top - contentRect.height - 8;
        left = triggerRect.left + (triggerRect.width - contentRect.width) / 2;
    }

    // Prevent clipping at viewport edges
    const padding = 8;
    const maxLeft = window.innerWidth - contentRect.width - padding;
    const maxTop = window.innerHeight - contentRect.height - padding;

    setCoords({
      top: Math.max(padding, Math.min(top, maxTop)),
      left: Math.max(padding, Math.min(left, maxLeft)),
    });
  }, [position]);

  const show = useCallback(() => {
    timeoutRef.current = setTimeout(() => {
      setIsOpen(true);
      // Position after state update so contentRef is available
      requestAnimationFrame(updatePosition);
    }, delay);
  }, [delay, updatePosition]);

  const hide = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsOpen(false);
  }, []);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') hide();
  }, [hide]);

  useEffect(() => {
    if (!isOpen) return;

    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, updatePosition, handleKeyDown]);

  // Trigger element props
  const triggerProps = {
    ref: triggerRef,
    onMouseEnter: show,
    onMouseLeave: hide,
    onFocus: show,
    onBlur: hide,
    'aria-describedby': isOpen ? 'tooltip-content' : undefined,
  };

  // Tooltip content rendered via portal
  const tooltipContent = isOpen && (
    createPortal(
      <div
        ref={contentRef}
        id="tooltip-content"
        role="tooltip"
        className="
          fixed z-[200]
          rounded-xl border border-[var(--border)] bg-[var(--card)]
          px-3 py-2 text-xs text-[var(--foreground)]
          shadow-[0_4px_12px_rgba(0,0,0,0.15)]
          animate-fade-in-fast
          pointer-events-none
          whitespace-nowrap
        "
        style={{ top: coords.top, left: coords.left }}
      >
        {content}
      </div>,
      document.body
    )
  );

  // If children is a function, call it with triggerProps
  if (typeof children === 'function') {
    return (
      <>
        {children(triggerProps)}
        {tooltipContent}
      </>
    );
  }

  // Otherwise wrap single child element
  const child = Array.isArray(children) ? children[0] : children;
  if (!child) return tooltipContent;

  return (
    <>
      {React.cloneElement(child, {
        ...triggerProps,
        onMouseEnter: (e) => { child.props.onMouseEnter?.(e); show(); },
        onMouseLeave: (e) => { child.props.onMouseLeave?.(e); hide(); },
        onFocus: (e) => { child.props.onFocus?.(e); show(); },
        onBlur: (e) => { child.props.onBlur?.(e); hide(); },
      })}
      {tooltipContent}
    </>
  );
}