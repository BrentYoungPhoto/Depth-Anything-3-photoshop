import { useState, useCallback, useEffect, useRef } from 'react';

export function usePhotoshop() {
  const [isConnected, setIsConnected] = useState(false);
  const [sending, setSending] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Periodically check if Photoshop is running
  useEffect(() => {
    const check = async () => {
      if (window.electronAPI) {
        const running = await window.electronAPI.photoshop.check();
        setIsConnected(running);
      }
    };

    check();
    intervalRef.current = setInterval(check, 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  /**
   * Send a mask (as base64 PNG) to Photoshop.
   */
  const sendMask = useCallback(async (maskBase64: string) => {
    if (!window.electronAPI) {
      return { success: false, message: 'Not running in Electron' };
    }
    setSending(true);
    try {
      const result = await window.electronAPI.photoshop.applyMask(maskBase64);
      return result;
    } finally {
      setSending(false);
    }
  }, []);

  return { isConnected, sending, sendMask };
}
