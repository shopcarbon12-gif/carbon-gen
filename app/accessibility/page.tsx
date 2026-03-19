"use client";

import { useMemo, useState } from "react";

type WidgetPosition = "left" | "right";

type AccessibilitySettings = {
  profileName: string;
  brandColor: string;
  panelColor: string;
  position: WidgetPosition;
  cornerRadius: number;
  widgetLabel: string;
  showTextLabel: boolean;
  features: {
    textScale: boolean;
    highContrast: boolean;
    readableFont: boolean;
    pauseAnimations: boolean;
    highlightLinks: boolean;
  };
};

const defaultSettings: AccessibilitySettings = {
  profileName: "Carbon Accessibility",
  brandColor: "#6d28d9",
  panelColor: "#111827",
  position: "right",
  cornerRadius: 14,
  widgetLabel: "Accessibility",
  showTextLabel: true,
  features: {
    textScale: true,
    highContrast: true,
    readableFont: true,
    pauseAnimations: true,
    highlightLinks: true,
  },
};

function buildInstallSnippet(settings: AccessibilitySettings) {
  const config = {
    brandColor: settings.brandColor,
    panelColor: settings.panelColor,
    position: settings.position,
    cornerRadius: settings.cornerRadius,
    label: settings.widgetLabel,
    showTextLabel: settings.showTextLabel,
    features: settings.features,
  };
  const encoded = encodeURIComponent(JSON.stringify(config));
  return `<script src="https://app.shopcarbon.com/accessibility/widget?config=${encoded}" defer></script>`;
}

function toButtonLabel(enabled: boolean) {
  return enabled ? "ON" : "OFF";
}

export default function AccessibilityPage() {
  const [settings, setSettings] = useState<AccessibilitySettings>(defaultSettings);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTextScale, setPreviewTextScale] = useState(100);
  const [previewContrast, setPreviewContrast] = useState(false);
  const [previewReadableFont, setPreviewReadableFont] = useState(false);
  const [previewLinkHighlight, setPreviewLinkHighlight] = useState(false);
  const [copied, setCopied] = useState(false);

  const installSnippet = useMemo(() => buildInstallSnippet(settings), [settings]);

  const previewStyles = useMemo(() => {
    const contrastText = previewContrast ? "#ffffff" : "#f8fafc";
    const contrastBg = previewContrast ? "#000000" : "#0b1220";
    return {
      color: contrastText,
      background: contrastBg,
      fontSize: `${previewTextScale}%`,
      fontFamily: previewReadableFont
        ? '"Atkinson Hyperlegible", "Segoe UI", Arial, sans-serif'
        : '"Inter", "Segoe UI", Arial, sans-serif',
    };
  }, [previewContrast, previewReadableFont, previewTextScale]);

  function updateFeature(name: keyof AccessibilitySettings["features"], value: boolean) {
    setSettings((prev) => ({
      ...prev,
      features: {
        ...prev.features,
        [name]: value,
      },
    }));
  }

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(installSnippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  function resetPreview() {
    setPreviewTextScale(100);
    setPreviewContrast(false);
    setPreviewReadableFont(false);
    setPreviewLinkHighlight(false);
  }

  return (
    <main className="page">
      <section className="header-card">
        <div>
          <h1>Accessibility Widget Builder</h1>
          <p>
            This is a custom in-house implementation for `app.shopcarbon.com/accessibility`, built from
            scratch so design and behavior are fully controlled by your team.
          </p>
        </div>
        <div className="pill">Legal-safe custom build</div>
      </section>

      <section className="grid">
        <article className="card">
          <h2>Brand & Layout</h2>
          <label>
            Profile name
            <input
              value={settings.profileName}
              onChange={(e) => setSettings((prev) => ({ ...prev, profileName: e.target.value }))}
            />
          </label>

          <label>
            Widget label
            <input
              value={settings.widgetLabel}
              onChange={(e) => setSettings((prev) => ({ ...prev, widgetLabel: e.target.value }))}
            />
          </label>

          <div className="row">
            <label>
              Brand color
              <input
                type="color"
                value={settings.brandColor}
                onChange={(e) => setSettings((prev) => ({ ...prev, brandColor: e.target.value }))}
              />
            </label>
            <label>
              Panel color
              <input
                type="color"
                value={settings.panelColor}
                onChange={(e) => setSettings((prev) => ({ ...prev, panelColor: e.target.value }))}
              />
            </label>
          </div>

          <div className="row">
            <label>
              Position
              <select
                value={settings.position}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, position: e.target.value as WidgetPosition }))
                }
              >
                <option value="right">Right</option>
                <option value="left">Left</option>
              </select>
            </label>

            <label>
              Corner radius: {settings.cornerRadius}px
              <input
                type="range"
                min={8}
                max={22}
                value={settings.cornerRadius}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, cornerRadius: Number(e.target.value) }))
                }
              />
            </label>
          </div>

          <label className="switch">
            <input
              type="checkbox"
              checked={settings.showTextLabel}
              onChange={(e) => setSettings((prev) => ({ ...prev, showTextLabel: e.target.checked }))}
            />
            Show text label next to icon
          </label>
        </article>

        <article className="card">
          <h2>Feature Matrix</h2>
          <p className="muted">Pick which controls will be available in your widget panel.</p>
          <div className="feature-list">
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.features.textScale}
                onChange={(e) => updateFeature("textScale", e.target.checked)}
              />
              Text scaling controls
            </label>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.features.highContrast}
                onChange={(e) => updateFeature("highContrast", e.target.checked)}
              />
              High contrast mode
            </label>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.features.readableFont}
                onChange={(e) => updateFeature("readableFont", e.target.checked)}
              />
              Readable font mode
            </label>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.features.pauseAnimations}
                onChange={(e) => updateFeature("pauseAnimations", e.target.checked)}
              />
              Pause animations mode
            </label>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.features.highlightLinks}
                onChange={(e) => updateFeature("highlightLinks", e.target.checked)}
              />
              Highlight links mode
            </label>
          </div>
        </article>
      </section>

      <section className="card">
        <h2>Install Snippet</h2>
        <p className="muted">
          Paste this script in your storefront head section. It loads your custom widget from your own app
          domain.
        </p>
        <textarea readOnly value={installSnippet} rows={3} />
        <div className="actions">
          <button className="btn primary" onClick={copySnippet}>
            {copied ? "Copied" : "Copy Snippet"}
          </button>
        </div>
      </section>

      <section className="card preview-card" style={previewStyles}>
        <h2>Live Preview (Behavior)</h2>
        <p>
          This preview demonstrates your selected controls on sample content before pushing into a live
          storefront.
        </p>
        <p>
          Carbon can deliver this exact feature set while keeping your dedicated design language, spacing,
          color palette, and icon style.
        </p>
        <a href="#accessibility-preview-anchor" className={previewLinkHighlight ? "link-highlight" : ""}>
          Preview link focus style
        </a>

        <div className="actions">
          {settings.features.textScale ? (
            <>
              <button className="btn" onClick={() => setPreviewTextScale((s) => Math.max(85, s - 10))}>
                A-
              </button>
              <button className="btn" onClick={() => setPreviewTextScale((s) => Math.min(150, s + 10))}>
                A+
              </button>
            </>
          ) : null}

          {settings.features.highContrast ? (
            <button className="btn" onClick={() => setPreviewContrast((v) => !v)}>
              Contrast {toButtonLabel(previewContrast)}
            </button>
          ) : null}

          {settings.features.readableFont ? (
            <button className="btn" onClick={() => setPreviewReadableFont((v) => !v)}>
              Readable Font {toButtonLabel(previewReadableFont)}
            </button>
          ) : null}

          {settings.features.highlightLinks ? (
            <button className="btn" onClick={() => setPreviewLinkHighlight((v) => !v)}>
              Link Highlight {toButtonLabel(previewLinkHighlight)}
            </button>
          ) : null}

          <button className="btn ghost" onClick={resetPreview}>
            Reset Preview
          </button>
        </div>

        <button
          className={`widget-trigger ${settings.position}`}
          style={{
            background: settings.brandColor,
            borderRadius: `${settings.cornerRadius}px`,
          }}
          onClick={() => setPreviewOpen((v) => !v)}
          aria-expanded={previewOpen}
          aria-label="Open accessibility panel preview"
        >
          <span aria-hidden>AA</span>
          {settings.showTextLabel ? <span>{settings.widgetLabel}</span> : null}
        </button>

        {previewOpen ? (
          <aside
            className={`widget-panel ${settings.position}`}
            style={{
              background: settings.panelColor,
              borderRadius: `${settings.cornerRadius}px`,
            }}
          >
            <h3>{settings.widgetLabel}</h3>
            <ul>
              {settings.features.textScale ? <li>Text scaling</li> : null}
              {settings.features.highContrast ? <li>High contrast</li> : null}
              {settings.features.readableFont ? <li>Readable fonts</li> : null}
              {settings.features.pauseAnimations ? <li>Pause animations</li> : null}
              {settings.features.highlightLinks ? <li>Highlight links</li> : null}
            </ul>
          </aside>
        ) : null}
      </section>

      <section className="card">
        <h2>Delivery Plan</h2>
        <ol>
          <li>Finalize visual language (button shape, icon, spacing, typography, motion).</li>
          <li>Hook settings to tenant storage so each shop has its own profile.</li>
          <li>Add analytics events for every feature toggle to measure adoption.</li>
          <li>Run QA for keyboard-only navigation, screen reader labels, and mobile viewport behavior.</li>
          <li>Launch staged rollout and compare accessibility engagement against your baseline.</li>
        </ol>
      </section>

      <style jsx>{`
        .page {
          max-width: 1120px;
          margin: 0 auto;
          padding: 22px 8px 26px;
          display: grid;
          gap: 14px;
          color: #f8fafc;
        }
        .header-card,
        .card {
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          padding: 18px;
          background: rgba(255, 255, 255, 0.035);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          display: grid;
          gap: 10px;
        }
        .header-card {
          grid-template-columns: 1fr auto;
          align-items: center;
          gap: 16px;
        }
        h1 {
          margin: 0;
          font-size: 1.35rem;
        }
        h2 {
          margin: 0;
          font-size: 1.06rem;
        }
        h3 {
          margin: 0;
          font-size: 0.98rem;
        }
        p {
          margin: 0;
          line-height: 1.45;
        }
        .muted {
          color: rgba(226, 232, 240, 0.86);
        }
        .pill {
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.3);
          padding: 7px 12px;
          font-size: 0.78rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        label {
          display: grid;
          gap: 6px;
          color: rgba(248, 250, 252, 0.95);
          font-weight: 600;
          font-size: 0.9rem;
        }
        input,
        select,
        textarea {
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.24);
          background: rgba(17, 24, 39, 0.6);
          color: #f8fafc;
          padding: 10px 12px;
          font-size: 0.9rem;
        }
        input[type="range"],
        input[type="color"] {
          padding: 0;
          min-height: 36px;
        }
        textarea {
          resize: vertical;
          min-height: 88px;
        }
        .row {
          display: grid;
          gap: 10px;
          grid-template-columns: 1fr 1fr;
        }
        .feature-list {
          display: grid;
          gap: 8px;
        }
        .switch {
          display: flex;
          align-items: center;
          gap: 10px;
          font-weight: 600;
        }
        .switch input {
          width: 18px;
          height: 18px;
          margin: 0;
        }
        .actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }
        .btn {
          border: 1px solid rgba(255, 255, 255, 0.3);
          background: rgba(255, 255, 255, 0.08);
          color: #f8fafc;
          border-radius: 10px;
          padding: 8px 12px;
          font-weight: 700;
          cursor: pointer;
        }
        .btn.primary {
          background: #f3f4f6;
          color: #050505;
          border-color: #f3f4f6;
        }
        .btn.ghost {
          background: transparent;
        }
        .preview-card {
          position: relative;
          min-height: 280px;
          overflow: hidden;
        }
        .link-highlight {
          display: inline-block;
          border: 2px dashed #fbbf24;
          border-radius: 8px;
          padding: 3px 6px;
        }
        .widget-trigger {
          position: absolute;
          bottom: 18px;
          border: 0;
          color: #fff;
          padding: 10px 14px;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
        }
        .widget-trigger.right {
          right: 18px;
        }
        .widget-trigger.left {
          left: 18px;
        }
        .widget-panel {
          position: absolute;
          bottom: 72px;
          width: min(320px, calc(100% - 36px));
          border: 1px solid rgba(255, 255, 255, 0.2);
          padding: 12px;
          display: grid;
          gap: 8px;
          color: #f8fafc;
        }
        .widget-panel.right {
          right: 18px;
        }
        .widget-panel.left {
          left: 18px;
        }
        .widget-panel ul {
          margin: 0;
          padding-left: 18px;
          display: grid;
          gap: 4px;
        }
        ol {
          margin: 0;
          padding-left: 18px;
          display: grid;
          gap: 6px;
        }
        @media (max-width: 920px) {
          .grid {
            grid-template-columns: 1fr;
          }
          .header-card {
            grid-template-columns: 1fr;
            gap: 12px;
          }
          .row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}
