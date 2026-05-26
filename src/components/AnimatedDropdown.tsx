"use client";

import { AnimatePresence, motion } from "framer-motion";
import { forwardRef, type CSSProperties, type ReactNode } from "react";

interface AnimatedDropdownProps {
  open: boolean;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  // Where the scale transform pivots. Default "top" so dropdowns grow
  // downward from their trigger, matching the Menu bubble's feel.
  originY?: "top" | "bottom" | "center";
  // Optional id for ARIA wiring.
  id?: string;
  role?: string;
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
}

// Drop-in replacement for `{open && <div>…</div>}` dropdown panels.
// Mirrors the clouds-menu-bubble animation: opacity 0→1, scale 0.95→1,
// tiny y offset, 200ms easeOut, transform-origin pinned to the top so the
// panel feels like it emerges from its trigger.
export const AnimatedDropdown = forwardRef<HTMLDivElement, AnimatedDropdownProps>(
  function AnimatedDropdown(
    { open, children, className, style, originY = "top", id, role, onClick },
    ref
  ) {
    return (
      <AnimatePresence>
        {open && (
          <motion.div
            ref={ref}
            id={id}
            role={role}
            onClick={onClick}
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            style={{ ...style, transformOrigin: `center ${originY}` }}
            className={className}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    );
  }
);
