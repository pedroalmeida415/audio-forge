// path/to/ReactScanComponent

"use client";
import { type JSX, useEffect } from "react";
// react-scan must be imported before react
import { scan } from "react-scan";

export function ReactScan(): JSX.Element | null {
  useEffect(() => {
    scan({
      enabled: true,
    });
  }, []);

  return null;
}
