"use client";

import { useCallback, useEffect, useState } from "react";
import { Landmark, LoaderCircle } from "lucide-react";
import { usePlaidLink, type PlaidLinkOnSuccess } from "react-plaid-link";

interface Props {
  accessToken: string;
  onConnected: () => Promise<void> | void;
}

export function PlaidConnectButton({ accessToken, onConnected }: Props) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const onSuccess = useCallback<PlaidLinkOnSuccess>(async (publicToken, metadata) => {
    setStatus("Finishing secure connection…");
    const response = await fetch("/api/plaid/exchange-public-token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ public_token: publicToken, institution_name: metadata.institution?.name }),
    });
    const data = await response.json() as { error?: string };
    if (!response.ok) {
      setStatus(data.error ?? "Unable to connect bank");
      return;
    }
    setStatus("Bank connected and baseline created.");
    setPendingOpen(false);
    setLinkToken(null);
    await onConnected();
  }, [accessToken, onConnected]);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit: (error) => {
      if (error) setStatus(error.display_message ?? error.error_message ?? "Plaid Link closed");
      setPendingOpen(false);
    },
  });

  useEffect(() => {
    if (ready && linkToken && pendingOpen) {
      open();
    }
  }, [ready, linkToken, pendingOpen, open]);

  async function begin() {
    setStatus("Opening secure bank connection…");
    const response = await fetch("/api/plaid/create-link-token", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await response.json() as { link_token?: string; error?: string };
    if (!response.ok || !data.link_token) {
      setStatus(data.error ?? "Unable to start Plaid Link");
      return;
    }
    setLinkToken(data.link_token);
    setPendingOpen(true);
  }

  return (
    <div className="stack-sm">
      <button className="button primary" type="button" onClick={begin} disabled={pendingOpen}>
        {pendingOpen ? <LoaderCircle className="spin" size={18} /> : <Landmark size={18} />}
        Connect checking account
      </button>
      {status && <p className="helper">{status}</p>}
    </div>
  );
}
