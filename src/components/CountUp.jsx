import React, { useEffect, useRef, useState } from "react";
import { animate } from "framer-motion";

/**
 * Animates a number from 0 to `target` once it scrolls into view.
 * Uses an overshoot easing so the number rises past the target then
 * settles back — a quick "raise and settle" bounce.
 */
const CountUp = ({
  target,
  suffix = "",
  duration = 1.8,
  decimals = 0,
  className,
}) => {
  const [display, setDisplay] = useState(0);
  const ref = useRef(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          animate(0, target, {
            duration,
            ease: [0.34, 1.56, 0.64, 1],
            onUpdate: (value) =>
              setDisplay(
                decimals > 0 ? Number(value.toFixed(decimals)) : Math.round(value),
              ),
          });
        }
      },
      { threshold: 0.4 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [target, duration, decimals]);

  return (
    <span ref={ref} className={className}>
      {decimals > 0
        ? display.toFixed(decimals)
        : display.toLocaleString("en-IN")}
      {suffix}
    </span>
  );
};

export default CountUp;
