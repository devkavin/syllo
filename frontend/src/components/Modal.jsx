import React, { useRef } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

// The existing dialog primitive owns focus containment, Escape and background isolation.
export default function Modal({ title, description, onClose, children, className = "", fallbackFocusRef, ...props }) {
  const returnFocus = useRef(document.activeElement);
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className={className} {...(!description && { "aria-describedby": undefined })}
      onCloseAutoFocus={event => {
        event.preventDefault();
        const opener = returnFocus.current;
        const target = opener?.isConnected && opener !== document.body && opener !== document.documentElement ? opener : fallbackFocusRef?.current;
        target?.focus();
      }} {...props}>
      <div className="pr-10 space-y-2">
        <DialogTitle className="font-display text-xl leading-snug">{title}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
      </div>
      {children}
    </DialogContent>
  </Dialog>;
}
