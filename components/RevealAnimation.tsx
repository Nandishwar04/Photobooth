"use client";

import { ReactNode, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Heart } from "lucide-react";

type Stage = "teaser-1" | "teaser-2" | "button" | "revealing" | "revealed";

interface RevealAnimationProps {
  children: ReactNode;
}

const HEART_BURST = Array.from({ length: 10 }, (_, i) => ({
  id: i,
  x: (Math.random() - 0.5) * 260,
  delay: 0.15 + Math.random() * 0.5,
  size: 12 + Math.random() * 16,
  drift: 120 + Math.random() * 140,
}));

/**
 * Orchestrates the "surprise" moment: a short teaser, an explicit
 * "View Our Photos" action (so the reveal always feels intentional
 * rather than something that just loads in), then a slide-up reveal of
 * the strip with a small heart-confetti flourish. Deliberately light —
 * the photos, passed in as `children`, are meant to be the focus.
 */
export function RevealAnimation({ children }: RevealAnimationProps) {
  const [stage, setStage] = useState<Stage>("teaser-1");

  useEffect(() => {
    if (stage === "teaser-1") {
      const t = setTimeout(() => setStage("teaser-2"), 1700);
      return () => clearTimeout(t);
    }
    if (stage === "teaser-2") {
      const t = setTimeout(() => setStage("button"), 1300);
      return () => clearTimeout(t);
    }
  }, [stage]);

  const reveal = () => {
    setStage("revealing");
    setTimeout(() => setStage("revealed"), 550);
  };

  return (
    <div className="relative flex min-h-[70vh] w-full flex-col items-center justify-center px-6 py-10">
      <AnimatePresence mode="wait">
        {stage === "teaser-1" && (
          <motion.p
            key="t1"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="font-display text-2xl text-ink sm:text-3xl"
          >
            Wait&hellip; there&apos;s something here.
          </motion.p>
        )}
        {stage === "teaser-2" && (
          <motion.p
            key="t2"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="font-display text-2xl text-ink sm:text-3xl"
          >
            Ready?
          </motion.p>
        )}
        {stage === "button" && (
          <motion.button
            key="btn"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            onClick={reveal}
            className="rounded-full bg-rose px-8 py-4 font-body text-base font-medium text-cream shadow-lg transition-transform active:scale-95"
          >
            View Our Photos ❤️
          </motion.button>
        )}
        {stage === "revealing" && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-10 w-10 animate-spin rounded-full border-2 border-rose/30 border-t-rose"
          />
        )}
      </AnimatePresence>

      {stage === "revealed" && (
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="relative flex w-full flex-col items-center"
        >
          <div className="pointer-events-none absolute inset-x-0 -top-6 flex justify-center">
            {HEART_BURST.map((h) => (
              <motion.span
                key={h.id}
                initial={{ opacity: 0, x: 0, y: 0, scale: 0.6 }}
                animate={{ opacity: [0, 1, 0], x: h.x, y: -h.drift, scale: 1 }}
                transition={{ duration: 1.4, delay: h.delay, ease: "easeOut" }}
                className="absolute"
              >
                <Heart className="fill-blush text-blush" style={{ width: h.size, height: h.size }} aria-hidden />
              </motion.span>
            ))}
          </div>
          {children}
        </motion.div>
      )}
    </div>
  );
}
