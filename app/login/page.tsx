"use client";

import { useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function onLogin() {
    const pw = password.trim();
    if (!pw) {
      setStatus("Error: Please enter a password.");
      return;
    }

    setLoading(true);
    setStatus(null);

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Login failed");
      window.location.href = "/dashboard";
    } catch (err: any) {
      setStatus(`Error: ${err?.message || "Login failed"}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: "48px auto", fontFamily: "system-ui" }}>
      <h1>Login</h1>
      <p>Password login</p>

      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        style={{ width: "100%", padding: 12, marginTop: 12 }}
        onKeyDown={(e) => {
          if (e.key === "Enter") onLogin();
        }}
      />

      <button
        onClick={onLogin}
        disabled={loading}
        style={{ width: "100%", padding: 12, marginTop: 12, cursor: "pointer" }}
      >
        {loading ? "Logging in..." : "Login"}
      </button>

      {status && (
        <pre
          style={{
            marginTop: 12,
            whiteSpace: "pre-wrap",
            color: status.startsWith("Error:") ? "crimson" : "green",
          }}
        >
          {status}
        </pre>
      )}
    </div>
  );
}

