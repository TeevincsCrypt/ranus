"use client";

import { useEffect, useState } from "react";
import { CopyIcon } from "./icons";

/** This deployment's public MCP endpoint, with a copy button. */
export function McpEndpoint() {
  const [url, setUrl] = useState("/mcp");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setUrl(`${window.location.origin}/mcp`);
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked: the URL stays selectable.
    }
  }

  return (
    <div className="endpoint">
      <span className="endpoint-method">POST</span>
      <code>{url}</code>
      <button type="button" onClick={() => void copy()} aria-label="Copy MCP endpoint URL">
        <CopyIcon /> {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
