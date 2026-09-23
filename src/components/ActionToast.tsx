import { useEffect, useRef } from 'react';
import type { UserMessage } from '../lib/userMessages';

interface ActionToastProps {
  message: UserMessage | null;
  onDismiss: () => void;
}

export function ActionToast({ message, onDismiss }: ActionToastProps) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!message) {
      return;
    }

    const timer = globalThis.setTimeout(() => {
      onDismissRef.current();
    }, 4000);
    return () => globalThis.clearTimeout(timer);
  }, [message]);

  if (!message) {
    return null;
  }

  return (
    <div className="action-toast" role="status" aria-live="polite">
      <div className={`action-toast-card action-toast-${message.tone}`}>
        <div className="action-toast-copy">
          <strong>{message.title}</strong>
          <span>{message.action}</span>
        </div>
        <button type="button" className="action-toast-close" onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      </div>
    </div>
  );
}
