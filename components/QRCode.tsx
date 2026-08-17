"use client";

import { QRCodeSVG } from "qrcode.react";

interface QRCodeProps {
  value: string;
}

export function QRCode({ value }: QRCodeProps) {
  return (
    <div className="rounded-2xl bg-cream p-4 shadow-sm">
      <QRCodeSVG
        value={value}
        size={148}
        bgColor="#FFFDF9"
        fgColor="#2B2523"
        level="M"
      />
    </div>
  );
}
