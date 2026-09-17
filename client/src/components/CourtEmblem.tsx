import React from "react";

/**
 * شعار وزارة العدل للمنصة. يُعرض صورة الشعار الرسمية مع الإبقاء على
 * الهوية اللونية للمنصة (الخلفية والحاويات) دون تغيير ألوان المنصة إلى ألوان الشعار.
 */
export default function CourtEmblem({ className = "h-6 w-6", title = "شعار وزارة العدل" }: { className?: string; title?: string }) {
  return (
    <img
      src="/moj-logo.png"
      alt={title}
      title={title}
      className={className}
      style={{ objectFit: "contain" }}
      loading="eager"
      draggable={false}
    />
  );
}

