"use client";

import { useState } from "react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function onLogin() {
    const un = username.trim().toLowerCase();
    const pw = password;

    if (!un) {
      setStatus("Enter your username.");
      return;
    }
    if (!pw) {
      setStatus("Enter your password.");
      return;
    }

    setLoading(true);
    setStatus(null);

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: un, password: pw }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Login failed (${res.status})`);
      }

      window.location.href = "/studio/images";
    } catch (e: any) {
      const msg = String(e?.message || "Login failed");
      if (msg.toLowerCase().includes("invalid username or password")) {
        setStatus("Invalid username or password.");
      } else {
        setStatus(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-shell">
      <section className="login-card glass-panel" aria-label="Carbon login">
        <h1>CARBON</h1>
        <p>STUDIO ENVIRONMENT</p>

        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Enter Username"
          autoComplete="username"
          onKeyDown={(e) => {
            if (e.key === "Enter") onLogin();
          }}
        />

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter Password"
          autoComplete="current-password"
          onKeyDown={(e) => {
            if (e.key === "Enter") onLogin();
          }}
        />

        <button type="button" onClick={onLogin} disabled={loading}>
          {loading ? "Authenticating..." : "Authenticate"}
        </button>

        {status ? <div className="status">{status}</div> : null}
      </section>

      <style jsx>{`
        .login-shell {
          min-height: 100vh;
          position: relative;
          display: grid;
          place-items: center;
          padding: 24px;
          overflow: hidden;
          color: #fff;
          font-family: "Inter", "Segoe UI", Roboto, Arial, sans-serif;
        }
        .login-card {
          position: relative;
          z-index: 2;
          width: min(460px, 92vw);
          border-radius: 22px;
          padding: 38px 38px 34px;
          text-align: center;
        }
        h1 {
          margin: 0;
          font-size: clamp(2.2rem, 5vw, 3.1rem);
          line-height: 1;
          letter-spacing: 0.04em;
          font-weight: 800;
          color: #f3f4f6;
        }
        p {
          margin: 12px 0 26px;
          font-size: 0.99rem;
          letter-spacing: 0.28em;
          color: rgba(226, 232, 240, 0.72);
        }
        input {
          width: 100%;
          min-height: 52px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.22);
          background: rgba(12, 8, 22, 0.42);
          color: #ffffff;
          font-size: 1.02rem;
          padding: 10px 14px;
          outline: none;
          margin-bottom: 12px;
        }
        input::placeholder {
          color: rgba(203, 213, 225, 0.62);
        }
        input:focus {
          border-color: rgba(255, 255, 255, 0.36);
        }
        button {
          width: 100%;
          height: 56px;
          border: 1px solid #f3f4f6;
          border-radius: 10px;
          background: #f3f4f6;
          color: #000;
          font-size: 1.06rem;
          font-weight: 700;
          cursor: pointer;
          margin-top: 4px;
        }
        button:disabled {
          opacity: 0.75;
          cursor: default;
        }
        .status {
          margin-top: 12px;
          font-size: 0.9rem;
          color: #fca5a5;
          min-height: 1.2rem;
        }
      `}</style>
    </div>
  );
}
