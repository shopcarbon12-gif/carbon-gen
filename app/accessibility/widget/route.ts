import { NextResponse } from "next/server";
import { loadAccessibilityWidgetConfig } from "@/lib/accessibilityConfigRepository";

const DEFAULT_CONFIG = {
  brandColor: "#6d28d9",
  panelColor: "#111827",
  triggerStyle: "solid",
  position: "right",
  sideOffset: 18,
  bottomOffset: 18,
  triggerSize: 76,
  iconSize: 20,
  panelWidth: 360,
  cornerRadius: 16,
  label: "Accessibility",
  language: "en",
  showTextLabel: true,
  logoUrl: "",
  logoAlt: "",
  logoVariant: "wordmark" as const,
  logoMaxHeight: 32,
  statementUrl: "",
  feedbackUrl: "",
  supportEmail: "",
  features: {
    profiles: true,
    textScale: true,
    highContrast: true,
    contrastModes: true,
    readableFont: true,
    pauseAnimations: true,
    highlightLinks: true,
    textSpacing: true,
    lineHeight: true,
    textAlign: true,
    saturation: true,
    hideImages: true,
    readingGuide: true,
    readingMask: true,
    bigCursor: true,
    pageStructure: true,
    languageSelector: true,
  },
};

function normalizeConfigObject(input: unknown) {
  if (!input || typeof input !== "object") return DEFAULT_CONFIG;
  const cfg = input as Record<string, unknown>;
  const featuresRaw =
    cfg.features && typeof cfg.features === "object"
      ? (cfg.features as Record<string, unknown>)
      : {};
  const getFeature = (key: keyof typeof DEFAULT_CONFIG.features, fallback: boolean) =>
    typeof featuresRaw[key] === "boolean" ? Boolean(featuresRaw[key]) : fallback;
  const normalizeUrl = (value: unknown, fallback: string) => {
    if (typeof value !== "string") return fallback;
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return fallback;
  };
  const normalizeEmail = (value: unknown, fallback: string) => {
    if (typeof value !== "string") return fallback;
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : fallback;
  };
  return {
    brandColor:
      typeof cfg.brandColor === "string" && cfg.brandColor.trim()
        ? cfg.brandColor
        : DEFAULT_CONFIG.brandColor,
    panelColor:
      typeof cfg.panelColor === "string" && cfg.panelColor.trim()
        ? cfg.panelColor
        : DEFAULT_CONFIG.panelColor,
    position: cfg.position === "left" ? "left" : "right",
    triggerStyle:
      cfg.triggerStyle === "outline" || cfg.triggerStyle === "glass"
        ? cfg.triggerStyle
        : DEFAULT_CONFIG.triggerStyle,
    sideOffset:
      typeof cfg.sideOffset === "number" && Number.isFinite(cfg.sideOffset)
        ? Math.max(8, Math.min(72, Math.round(cfg.sideOffset)))
        : DEFAULT_CONFIG.sideOffset,
    bottomOffset:
      typeof cfg.bottomOffset === "number" && Number.isFinite(cfg.bottomOffset)
        ? Math.max(8, Math.min(72, Math.round(cfg.bottomOffset)))
        : DEFAULT_CONFIG.bottomOffset,
    triggerSize:
      typeof cfg.triggerSize === "number" && Number.isFinite(cfg.triggerSize)
        ? Math.max(52, Math.min(96, Math.round(cfg.triggerSize)))
        : DEFAULT_CONFIG.triggerSize,
    iconSize:
      typeof cfg.iconSize === "number" && Number.isFinite(cfg.iconSize)
        ? Math.max(14, Math.min(34, Math.round(cfg.iconSize)))
        : DEFAULT_CONFIG.iconSize,
    panelWidth:
      typeof cfg.panelWidth === "number" && Number.isFinite(cfg.panelWidth)
        ? Math.max(260, Math.min(420, Math.round(cfg.panelWidth)))
        : DEFAULT_CONFIG.panelWidth,
    cornerRadius:
      typeof cfg.cornerRadius === "number" && Number.isFinite(cfg.cornerRadius)
        ? Math.max(8, Math.min(24, Math.round(cfg.cornerRadius)))
        : DEFAULT_CONFIG.cornerRadius,
    label:
      (typeof cfg.label === "string" && cfg.label.trim() ? cfg.label : "") ||
      (typeof cfg.widgetLabel === "string" && cfg.widgetLabel.trim() ? cfg.widgetLabel : "") ||
      DEFAULT_CONFIG.label,
    language:
      cfg.language === "es" || cfg.language === "pt-BR" || cfg.language === "he"
        ? cfg.language
        : DEFAULT_CONFIG.language,
    showTextLabel:
      typeof cfg.showTextLabel === "boolean" ? cfg.showTextLabel : DEFAULT_CONFIG.showTextLabel,
    logoUrl:
      typeof cfg.logoUrl === "string" && cfg.logoUrl.trim()
        ? normalizeUrl(cfg.logoUrl, "") || ""
        : DEFAULT_CONFIG.logoUrl,
    logoAlt: typeof cfg.logoAlt === "string" ? cfg.logoAlt.trim() : DEFAULT_CONFIG.logoAlt,
    logoVariant:
      cfg.logoVariant === "symbol" || cfg.logoVariant === "full" || cfg.logoVariant === "wordmark"
        ? cfg.logoVariant
        : DEFAULT_CONFIG.logoVariant,
    logoMaxHeight:
      typeof cfg.logoMaxHeight === "number" && Number.isFinite(cfg.logoMaxHeight)
        ? Math.max(12, Math.min(120, Math.round(cfg.logoMaxHeight)))
        : DEFAULT_CONFIG.logoMaxHeight,
    statementUrl: normalizeUrl(cfg.statementUrl, DEFAULT_CONFIG.statementUrl),
    feedbackUrl: normalizeUrl(cfg.feedbackUrl, DEFAULT_CONFIG.feedbackUrl),
    supportEmail: normalizeEmail(cfg.supportEmail, DEFAULT_CONFIG.supportEmail),
    features: {
      profiles: getFeature("profiles", DEFAULT_CONFIG.features.profiles),
      textScale: getFeature("textScale", DEFAULT_CONFIG.features.textScale),
      highContrast: getFeature("highContrast", DEFAULT_CONFIG.features.highContrast),
      contrastModes: getFeature("contrastModes", DEFAULT_CONFIG.features.contrastModes),
      readableFont: getFeature("readableFont", DEFAULT_CONFIG.features.readableFont),
      pauseAnimations: getFeature("pauseAnimations", DEFAULT_CONFIG.features.pauseAnimations),
      highlightLinks: getFeature("highlightLinks", DEFAULT_CONFIG.features.highlightLinks),
      textSpacing: getFeature("textSpacing", DEFAULT_CONFIG.features.textSpacing),
      lineHeight: getFeature("lineHeight", DEFAULT_CONFIG.features.lineHeight),
      textAlign: getFeature("textAlign", DEFAULT_CONFIG.features.textAlign),
      saturation: getFeature("saturation", DEFAULT_CONFIG.features.saturation),
      hideImages: getFeature("hideImages", DEFAULT_CONFIG.features.hideImages),
      readingGuide: getFeature("readingGuide", DEFAULT_CONFIG.features.readingGuide),
      readingMask: getFeature("readingMask", DEFAULT_CONFIG.features.readingMask),
      bigCursor: getFeature("bigCursor", DEFAULT_CONFIG.features.bigCursor),
      pageStructure: getFeature("pageStructure", DEFAULT_CONFIG.features.pageStructure),
      languageSelector: getFeature("languageSelector", DEFAULT_CONFIG.features.languageSelector),
    },
  };
}

function safeParseConfig(raw: string | null) {
  if (!raw) return DEFAULT_CONFIG;
  try {
    return normalizeConfigObject(JSON.parse(raw));
  } catch {
    return DEFAULT_CONFIG;
  }
}

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const parsedUrl = new URL(request.url);
  const { searchParams } = parsedUrl;
  const configParam = searchParams.get("config");
  const scope = (searchParams.get("scope") || "default").trim() || "default";
  const usageEndpoint = `${parsedUrl.origin}/api/accessibility/usage`;
  let config = safeParseConfig(configParam);
  if (!configParam) {
    try {
      const saved = await loadAccessibilityWidgetConfig(scope);
      config = normalizeConfigObject(saved);
    } catch {
      config = DEFAULT_CONFIG;
    }
  }
  const configJson = JSON.stringify(config);

  const js = `(function(){if(window.__carbonA11yLoaded){return;}window.__carbonA11yLoaded=true;
/* ca-assist-ui v3 studio | Phase A+B a11y (see docs/accessibility-widget-phase-a-b-spec.md)
 * Panel: non-modal named region (not aria-modal). No focus trap — Tab may move into page content.
 * Esc closes only while focus is inside the panel (keydown on panel). Space toggles switches; Arrow/Home/End in radiogroups.
 * Phase C motion: effectiveReducedMotion() + shouldMinimizeMotion() (pauseAnimations wins). Shell class ca-assist-reduce-motion gates widget CSS.
 * Config is JSON.parse-wrapped so embedded strings cannot break the script parser (e.g. </script>, U+2028).
 */
var config=JSON.parse(${JSON.stringify(configJson)});
var usageEndpoint=${JSON.stringify(usageEndpoint)};
var scope=${JSON.stringify(scope)};
var widgetPanelBg=(function(){var el=document.currentScript;if(!el||!el.src){var n=document.querySelectorAll('script[src*="accessibility/widget"]');el=n.length?n[n.length-1]:null;}var b=el&&el.src||"";try{return new URL("/accessibility-assets/widget-panel-bg-pic2.png",b||location.href).href;}catch(_e){var o=b?b.replace(/\\\/[^/]*$/,""):String(location.origin||"");return o+"/accessibility-assets/widget-panel-bg-pic2.png";}})();
var root=document.documentElement;
var body=document.body;
var storageKey='carbonA11yPrefs::'+(location.hostname||'site')+'::'+scope;
var state={
  textScale:100,
  highContrast:false,
  readableFont:false,
  pauseAnimations:false,
  highlightLinks:false,
  contrastMode:'none',
  textSpacing:'normal',
  lineHeight:'normal',
  textAlign:'default',
  saturation:'normal',
  hideImages:false,
  readingGuide:false,
  readingMask:false,
  bigCursor:false,
  language:config.language||'en',
  motionPreference:'system'
};
var ui={};
var rerenderPanel=function(){};
var liveRegionRef=null;
var lastAnnounce='';
var lastAnnounceTs=0;
var scaleAnnounceTimer=null;
var styleTag=document.createElement("style");
styleTag.id="carbon-a11y-style";
document.head.appendChild(styleTag);
var widgetCss='' +
  '.ca-assist-root,.ca-assist-root::before,.ca-assist-root::after,.ca-assist-root *,.ca-assist-root *::before,.ca-assist-root *::after{box-sizing:border-box;margin:0;padding:0;font-family:ui-sans-serif,system-ui,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif !important;font-size:14px;line-height:1.45;letter-spacing:normal !important;text-decoration:none;color:inherit;border:none;background:transparent;box-shadow:none;outline:none;-webkit-font-smoothing:antialiased}' +
  '.ca-assist-root img{display:block;max-width:100%;height:auto;object-fit:contain}' +
  '.ca-assist-root button,.ca-assist-root [role="switch"],.ca-assist-root [role="radio"]{font:inherit;color:inherit;cursor:pointer;appearance:none;-webkit-appearance:none;border-radius:0}' +
  '.ca-assist-shell{position:relative;display:block;isolation:isolate;--ca-fab-size:76px}' +
  '.ca-assist-lang-he,.ca-assist-lang-he button,.ca-assist-lang-he .ca-assist-toggle__label,.ca-assist-lang-he .ca-assist-navrow__label,.ca-assist-lang-he .ca-assist-title{font-family:"Noto Sans Hebrew","Segoe UI","Arial Hebrew",Arial,sans-serif !important}' +
  '.ca-assist-launcher--fab{--ca-glow:color-mix(in srgb,var(--ca-accent,#7c3aed) 58%,transparent);position:relative;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;width:var(--ca-launcher-size,76px);height:var(--ca-launcher-size,76px);min-width:0;max-width:none;padding:0;border-radius:50%;border:none;outline:none;color:#f4f4f5;cursor:grab;touch-action:none;-webkit-tap-highlight-color:transparent;transition:transform .18s ease,box-shadow .22s ease,filter .2s ease;background:radial-gradient(circle at 30% 24%,rgba(255,255,255,.22) 0%,color-mix(in srgb,var(--ca-accent,#7c3aed) 38%,rgba(52,36,88,.88)) 42%,rgba(12,8,22,.98) 100%);box-shadow:0 0 0 1px color-mix(in srgb,var(--ca-accent,#a78bfa) 22%,transparent) inset,0 0 40px color-mix(in srgb,var(--ca-accent,#7c3aed) 50%,transparent),0 0 64px color-mix(in srgb,var(--ca-accent,#a78bfa) 26%,transparent),0 18px 44px rgba(0,0,0,.58);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}' +
  '.ca-assist-launcher--fab::before{content:"";position:absolute;inset:4px;border-radius:50%;pointer-events:none;background:linear-gradient(148deg,rgba(255,255,255,.28) 0%,transparent 42%,transparent 58%,rgba(255,255,255,.06));opacity:.72}' +
  '.ca-assist-launcher--fab::after{content:"";position:absolute;inset:-6px;border-radius:50%;pointer-events:none;box-shadow:0 0 36px color-mix(in srgb,var(--ca-accent,#7c3aed) 52%,transparent),0 0 64px color-mix(in srgb,var(--ca-accent,#a78bfa) 28%,transparent);opacity:1}' +
  '.ca-assist-launcher--fab:hover{transform:translateY(-2px);filter:brightness(1.07)}' +
  '.ca-assist-launcher--fab:active:not(.ca-assist-launcher--dragging){transform:translateY(0) scale(.97)}' +
  '.ca-assist-launcher--fab.ca-assist-launcher--dragging{cursor:grabbing;transform:scale(1.06);box-shadow:0 0 44px color-mix(in srgb,var(--ca-accent,#7c3aed) 58%,transparent),0 18px 50px rgba(0,0,0,.62)}' +
  '.ca-assist-launcher--fab-outline{background:radial-gradient(circle at 30% 24%,rgba(255,255,255,.12),color-mix(in srgb,var(--ca-accent,#7c3aed) 22%,rgba(16,10,28,.88)))}' +
  '.ca-assist-launcher--fab-glass{background:linear-gradient(155deg,rgba(255,255,255,.16),rgba(255,255,255,.04)),radial-gradient(circle at 32% 26%,rgba(255,255,255,.12),color-mix(in srgb,var(--ca-accent,#7c3aed) 18%,rgba(8,6,18,.82)))}' +
  '.ca-assist-launcher--fab-solid{}' +
  '.ca-assist-launcher--fab:focus-visible{outline:2px solid color-mix(in srgb,var(--ca-accent,#a78bfa) 75%,#fff);outline-offset:4px}' +
  '.ca-assist-launcher--fab .ca-assist-launcher__glyph{display:flex;align-items:center;justify-content:center;width:100%;height:100%;border:none;background:transparent;box-shadow:none;border-radius:0;color:color-mix(in srgb,var(--ca-accent,#a78bfa) 78%,#f8fafc)}' +
  '.ca-assist-launcher--fab .ca-assist-launcher__glyph svg{display:block;width:62%;height:62%;filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))}' +
  '.ca-assist-markword{display:inline-flex;align-items:baseline;gap:0;letter-spacing:.14em !important;text-transform:uppercase !important;white-space:nowrap;font-size:10.5px;font-weight:600;color:#f4f4f5}' +
  '.ca-assist-markword--launcher{font-size:10px;letter-spacing:.16em !important}' +
  '.ca-assist-markword--strip{font-size:11px;letter-spacing:.18em !important}' +
  '.ca-assist-markword--footer{font-size:8px;letter-spacing:.12em !important;opacity:.75}' +
  '.ca-assist-markword__carbon{font-weight:750;color:#fafafa}' +
  '.ca-assist-markword__assist{font-weight:520;color:rgba(228,228,231,.55)}' +
  '.ca-assist-brand{display:inline-flex;align-items:center;min-width:0;max-width:100%}' +
  '.ca-assist-logo-img{display:block;max-width:min(200px,55vw);height:auto;object-fit:contain;filter:drop-shadow(0 1px 2px rgba(0,0,0,.5))}' +
  '.ca-assist-wordmark{font-weight:750;font-size:10px;letter-spacing:.2em !important;color:#f4f4f5;text-transform:uppercase !important;white-space:nowrap}' +
  '.ca-assist-panel{position:absolute;bottom:calc(var(--ca-fab-size, 64px) + 10px + env(safe-area-inset-bottom,0px));max-width:calc(100vw - 24px);width:100%;color:#e4e4e7;border:1px solid color-mix(in srgb,var(--ca-accent,#c4b5fd) 28%,rgba(255,255,255,.14));padding:0;border-radius:16px;display:none;max-height:min(82vh,760px);overflow:hidden;flex-direction:column;background:linear-gradient(180deg,rgba(8,6,18,.88) 0%,rgba(12,8,22,.82) 45%,rgba(6,4,14,.9) 100%),linear-gradient(125deg,color-mix(in srgb,var(--ca-accent,#7c3aed) 22%,transparent) 0%,transparent 55%),radial-gradient(ellipse 120% 80% at 50% 100%,rgba(180,100,140,.12),transparent 55%),url(' + JSON.stringify(widgetPanelBg) + ') center center/cover no-repeat;background-color:#0c0a12;backdrop-filter:blur(16px) saturate(1.15);-webkit-backdrop-filter:blur(16px) saturate(1.15);box-shadow:0 28px 80px rgba(0,0,0,.75),0 0 0 1px rgba(255,255,255,.06) inset,0 0 48px color-mix(in srgb,var(--ca-accent,#7c3aed) 18%,transparent),0 1px 0 rgba(255,255,255,.08) inset}' +
  '.ca-assist-panel,.ca-assist-shell .ca-assist-panel{display:flex}' +
  '.ca-assist-panel::-webkit-scrollbar{width:6px}' +
  '.ca-assist-panel-body::-webkit-scrollbar{width:6px}' +
  '.ca-assist-panel-body::-webkit-scrollbar-thumb{background:rgba(255,255,255,.12);border-radius:999px}' +
  '.ca-assist-head{flex-shrink:0;border-bottom:1px solid rgba(255,255,255,.1);background:linear-gradient(180deg,rgba(255,255,255,.07) 0%,transparent 70%),radial-gradient(120% 100% at 0% 0%,color-mix(in srgb,var(--ca-accent,#a78bfa) 18%,transparent),transparent 50%)}' +
  '.ca-assist-brand-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 18px 12px;border-bottom:1px solid rgba(255,255,255,.08)}' +
  '.ca-assist-brand-left{display:flex;align-items:center;min-width:0;gap:10px}' +
  '.ca-assist-head-titles{padding:4px 18px 18px}' +
  '.ca-assist-eyebrow{font-size:10px;font-weight:650;letter-spacing:.16em !important;text-transform:uppercase !important;color:rgba(228,228,231,.72);margin-bottom:8px}' +
  '.ca-assist-title{font-weight:650;font-size:18px;letter-spacing:-.015em !important;color:#fafafa;margin:0;line-height:1.25}' +
  '.ca-assist-helper{margin-top:8px;font-size:12.5px;font-weight:450;color:rgba(212,212,216,.78);line-height:1.5;max-width:46ch}' +
  '.ca-assist-close{border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#fafafa;border-radius:12px;width:36px;height:36px;font-size:18px;line-height:1;cursor:pointer;flex:0 0 auto;transition:background .15s ease,border-color .15s ease,box-shadow .15s ease}' +
  '.ca-assist-close:hover{background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.28);box-shadow:0 0 0 1px color-mix(in srgb,var(--ca-accent,#a78bfa) 35%,transparent)}' +
  '.ca-assist-close:focus-visible{outline:2px solid color-mix(in srgb,var(--ca-accent,#c4b5fd) 70%,#fff);outline-offset:2px}' +
  '.ca-assist-panel-body{flex:1;min-height:0;overflow:auto;padding:16px 14px 20px;display:flex;flex-direction:column;gap:14px}' +
  '.ca-assist-block{display:flex;flex-direction:column;gap:8px}' +
  '.ca-assist-block > .ca-assist-sec{margin-bottom:0}' +
  '.ca-assist-sheet{display:flex;flex-direction:column;gap:0;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:linear-gradient(180deg,rgba(72,48,110,.22) 0%,rgba(20,14,36,.28) 100%);overflow:hidden;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}' +
  '.ca-assist-sheet > .ca-assist-sec{padding:12px 14px 0;margin:0}' +
  '.ca-assist-stack{display:flex;flex-direction:column;gap:0;border:0;border-radius:0;background:transparent;overflow:visible}' +
  '.ca-assist-stack > .ca-assist-sec{margin:0 0 6px 2px;padding:0}' +
  '.ca-assist-launcher__cluster{display:inline-flex;align-items:center;gap:10px;min-width:0;flex:1}' +
  '.ca-assist-strip-cluster{display:flex;align-items:center;gap:10px;min-width:0;flex:1}' +
  '.ca-assist-logo-img--launcher{max-height:28px!important;width:auto!important}' +
  '.ca-assist-logo-img--strip{max-height:40px!important;width:auto!important}' +
  '.ca-assist-panel-sub{margin-top:6px;font-size:12.5px;font-weight:550;letter-spacing:.04em;color:rgba(228,228,231,.88);line-height:1.4}' +
  '.ca-assist-field--compact{padding:8px 0}' +
  '.ca-assist-field__name--compact{font-size:8.5px;font-weight:600;letter-spacing:.12em;margin-bottom:6px}' +
  '.ca-assist-seg--tight{gap:4px}' +
  '.ca-assist-field--compact .ca-assist-seg__btn{padding:5px 11px;border-radius:999px;min-height:30px;font-size:10.5px;font-weight:500;border-color:rgba(255,255,255,.08);background:rgba(0,0,0,.22)}' +
  '.ca-assist-field--compact .ca-assist-seg__btn:hover{background:rgba(255,255,255,.035)}' +
  '.ca-assist-field--compact .ca-assist-seg__btn[aria-checked="true"]{border-color:rgba(255,255,255,.16);background:rgba(255,255,255,.045);color:#f4f4f5;font-weight:520}' +
  '.ca-assist-sec{font-size:10px;font-weight:650;letter-spacing:.14em !important;text-transform:uppercase !important;color:rgba(228,228,231,.62);margin:0 0 10px 4px}' +
  '.ca-assist-field{padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.07)}' +
  '.ca-assist-field:last-child{border-bottom:0}' +
  '.ca-assist-field__name{font-size:10px;font-weight:650;letter-spacing:.12em;text-transform:uppercase !important;color:rgba(212,212,216,.65);margin-bottom:10px}' +
  '.ca-assist-seg{display:flex;flex-wrap:wrap;gap:6px}' +
  '.ca-assist-seg__btn{padding:8px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.35);color:#f4f4f5;font-size:12px;font-weight:550;min-height:40px;cursor:pointer;transition:background .15s ease,border-color .15s ease,color .15s ease}' +
  '.ca-assist-seg__btn:hover{border-color:rgba(255,255,255,.22);background:rgba(255,255,255,.06)}' +
  '.ca-assist-seg__btn[aria-checked="true"]{border-color:color-mix(in srgb,var(--ca-accent,#a78bfa) 55%,rgba(255,255,255,.2));background:color-mix(in srgb,var(--ca-accent,#7c3aed) 22%,rgba(255,255,255,.06));color:#fff;font-weight:600}' +
  '.ca-assist-seg__btn:focus-visible{outline:1px solid color-mix(in srgb,var(--ca-accent,#a78bfa) 55%,#fff);outline-offset:2px}' +
  '.ca-assist-toggle{width:100%;display:flex;align-items:center;justify-content:space-between;gap:16px;text-align:left;border:0;border-bottom:1px solid rgba(255,255,255,.07);background:transparent;color:#e4e4e7;padding:12px 16px;min-height:48px;cursor:pointer;transition:background .12s ease}' +
  '.ca-assist-toggle:last-child{border-bottom:0}' +
  '.ca-assist-toggle:hover{background:rgba(255,255,255,.04)}' +
  '.ca-assist-toggle:focus-visible{outline:2px solid color-mix(in srgb,var(--ca-accent,#c4b5fd) 65%,#fff);outline-offset:-2px}' +
  '.ca-assist-toggle__text{display:flex;flex-direction:column;gap:4px;align-items:flex-start;min-width:0;flex:1}' +
  '.ca-assist-toggle__label{font-size:14px;font-weight:600;line-height:1.3;color:#fafafa}' +
  '.ca-assist-toggle__hint{font-size:12px;font-weight:450;line-height:1.4;color:rgba(196,196,205,.92)}' +
  '.ca-assist-switch{flex:0 0 auto;display:flex;align-items:center;align-self:center}' +
  '.ca-assist-switch__track{position:relative;display:block;width:46px;height:26px;border-radius:999px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.12);transition:background .18s ease,border-color .18s ease;flex-shrink:0}' +
  '.ca-assist-toggle.is-on .ca-assist-switch__track{background:color-mix(in srgb,var(--ca-accent,#7c3aed) 55%,rgba(255,255,255,.12));border-color:color-mix(in srgb,var(--ca-accent,#a78bfa) 40%,rgba(255,255,255,.15));box-shadow:0 0 16px color-mix(in srgb,var(--ca-accent,#7c3aed) 25%,transparent) inset}' +
  '.ca-assist-switch__thumb{position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:999px;background:linear-gradient(180deg,#fff,#e2e8f0);box-shadow:0 1px 4px rgba(0,0,0,.45);transition:transform .18s cubic-bezier(.2,.85,.25,1)}' +
  '.ca-assist-toggle.is-on .ca-assist-switch__thumb{transform:translateX(20px)}' +
  '.ca-assist-navrow{width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;text-align:left;border:0;border-bottom:1px solid rgba(255,255,255,.07);background:transparent;color:#e4e4e7;padding:12px 16px;min-height:48px;cursor:pointer;transition:background .12s ease}' +
  '.ca-assist-navrow:last-child{border-bottom:0}' +
  '.ca-assist-navrow:hover{background:rgba(255,255,255,.04)}' +
  '.ca-assist-navrow__label{font-size:14px;font-weight:550;color:#f4f4f5}' +
  '.ca-assist-navrow__right{display:flex;align-items:center;gap:8px}' +
  '.ca-assist-navrow__val{font-size:11px;font-weight:700;letter-spacing:.06em;color:rgba(228,228,231,.72)}' +
  '.ca-assist-navrow__chev{font-size:14px;color:rgba(212,212,216,.35);font-weight:300}' +
  '.ca-assist-step{display:flex;align-items:center;justify-content:center;gap:10px;padding:4px 0 2px}' +
  '.ca-assist-step__btn{width:40px;height:40px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.4);color:#fafafa;font-size:20px;line-height:1;cursor:pointer;transition:background .15s ease,border-color .15s ease}' +
  '.ca-assist-step__btn:hover{border-color:rgba(255,255,255,.2);background:rgba(255,255,255,.06)}' +
  '.ca-assist-step__val{min-width:56px;text-align:center;font-size:13px;font-weight:650;letter-spacing:.02em;color:#fafafa}' +
  '.ca-assist-profile-strip{display:flex;gap:7px;overflow:auto;padding:4px 2px 8px;scrollbar-width:none}' +
  '.ca-assist-profile-strip::-webkit-scrollbar{display:none}' +
  '.ca-assist-profile-pill{white-space:nowrap;border:1px solid rgba(255,255,255,.14);background:linear-gradient(180deg,rgba(255,255,255,.08),rgba(255,255,255,.03));border-radius:999px;padding:9px 14px;font-size:12px;font-weight:600;color:#f4f4f5;min-height:40px;cursor:pointer;transition:background .14s ease,border-color .14s ease,transform .14s ease}' +
  '.ca-assist-profile-pill:hover{border-color:rgba(255,255,255,.18);background:rgba(255,255,255,.08)}' +
  '.ca-assist-profile-clear{margin-top:4px;width:100%;border:1px dashed rgba(255,255,255,.16);background:transparent;border-radius:11px;padding:9px 11px;font-size:10.5px;font-weight:550;color:rgba(212,212,216,.55);cursor:pointer}' +
  '.ca-assist-profile-clear:hover{background:rgba(255,255,255,.04);color:rgba(250,250,250,.85)}' +
  '.ca-assist-footer{flex-shrink:0;display:flex;flex-direction:column;gap:0;border-top:1px solid rgba(255,255,255,.07);background:linear-gradient(180deg,transparent,rgba(0,0,0,.22))}' +
  '.ca-assist-footer-dynamic{display:flex;flex-direction:column;gap:10px;padding:14px 16px 12px}' +
  '.ca-assist-footer-lang{display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap}' +
  '.ca-assist-footer-lang .ca-assist-field{flex:1;min-width:180px;border:0;padding:0;background:transparent}' +
  '.ca-assist-footer-lang .ca-assist-field__name{display:none}' +
  '.ca-assist-footer-lang .ca-assist-seg{flex-wrap:wrap}' +
  '.ca-assist-footer-globe{flex:0 0 auto;display:grid;place-items:center;width:28px;height:28px;margin-top:2px;border-radius:999px;border:1px solid color-mix(in srgb,var(--ca-accent,#a78bfa) 28%,rgba(255,255,255,.1));background:rgba(0,0,0,.35);color:color-mix(in srgb,var(--ca-accent,#c4b5fd) 45%,rgba(212,212,216,.55))}' +
  '.ca-assist-footlink{align-self:flex-start;font-size:12px;font-weight:550;color:#e9d5ff;text-decoration:none;border-bottom:1px solid color-mix(in srgb,var(--ca-accent,#a78bfa) 45%,rgba(255,255,255,.2));padding-bottom:2px;letter-spacing:.01em}' +
  '.ca-assist-footlink:hover{color:#fff;border-bottom-color:rgba(255,255,255,.28)}' +
  '.ca-assist-footreset{align-self:flex-start;display:inline-flex;align-items:center;gap:8px;border:0;background:transparent;color:rgba(228,228,231,.85);font-size:11.5px;font-weight:650;letter-spacing:.08em;text-transform:uppercase !important;cursor:pointer;padding:6px 0;min-height:44px;transition:color .15s ease}' +
  '.ca-assist-footreset:hover{color:#fff}' +
  '.ca-assist-footreset__chev{opacity:.55;font-size:12px}' +
  '.ca-assist-footer-brand{display:flex;align-items:center;justify-content:flex-end;padding:0 14px 14px;min-width:0}' +
  '.ca-assist-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}' +
  '.ca-assist-region{border:0;padding:0;margin:0}' +
  '.ca-assist-shell.ca-assist-reduce-motion .ca-assist-launcher--fab,.ca-assist-shell.ca-assist-reduce-motion .ca-assist-launcher--fab:hover{transition:none !important;transform:none !important;filter:none !important}' +
  '.ca-assist-shell.ca-assist-reduce-motion .ca-assist-close{transition:none !important}' +
  '.ca-assist-shell.ca-assist-reduce-motion .ca-assist-switch__track,.ca-assist-shell.ca-assist-reduce-motion .ca-assist-switch__thumb{transition:none !important}' +
  '.ca-assist-shell.ca-assist-reduce-motion .ca-assist-toggle,.ca-assist-shell.ca-assist-reduce-motion .ca-assist-navrow,.ca-assist-shell.ca-assist-reduce-motion .ca-assist-seg__btn,.ca-assist-shell.ca-assist-reduce-motion .ca-assist-profile-pill,.ca-assist-shell.ca-assist-reduce-motion .ca-assist-step__btn{transition:none !important}' +
  '.ca-assist-sec-group{display:flex;flex-direction:column;gap:0;border:1px solid rgba(255,255,255,.1);border-radius:14px;overflow:hidden;background:linear-gradient(180deg,rgba(72,52,110,.28) 0%,rgba(18,12,32,.32) 100%);margin-bottom:10px;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:inset 0 1px 0 rgba(255,255,255,.06)}' +
  '.ca-assist-sec-group-header{padding:10px 16px 6px;font-size:10px;font-weight:650;letter-spacing:.14em;text-transform:uppercase !important;color:rgba(228,228,231,.7);border-bottom:1px solid rgba(255,255,255,.08)}' +
  '.ca-assist-sec-group .ca-assist-toggle{border-radius:0;border-bottom:1px solid rgba(255,255,255,.04)}' +
  '.ca-assist-sec-group .ca-assist-toggle:last-child{border-bottom:0}' +
  '.ca-assist-panel--mono{background:linear-gradient(180deg,rgba(6,4,14,.9) 0%,rgba(10,6,20,.85) 50%,rgba(4,3,12,.92) 100%),linear-gradient(125deg,color-mix(in srgb,var(--ca-accent,#7c3aed) 24%,transparent) 0%,transparent 52%),radial-gradient(ellipse 100% 70% at 50% 100%,rgba(160,90,120,.1),transparent 50%),url(' + JSON.stringify(widgetPanelBg) + ') center center/cover no-repeat;background-color:#090712;backdrop-filter:blur(18px) saturate(1.1);-webkit-backdrop-filter:blur(18px) saturate(1.1)}' +
  '';
var guideLine=document.createElement('div');
guideLine.id='carbon-a11y-guide-line';
guideLine.style.position='fixed';
guideLine.style.left='0';
guideLine.style.right='0';
guideLine.style.height='2px';
guideLine.style.background='rgba(253, 224, 71, 0.95)';
guideLine.style.zIndex='2147483002';
guideLine.style.pointerEvents='none';
guideLine.style.display='none';
guideLine.style.top='0';
body.appendChild(guideLine);
var readingMask=document.createElement('div');
readingMask.id='carbon-a11y-reading-mask';
readingMask.style.position='fixed';
readingMask.style.left='0';
readingMask.style.top='0';
readingMask.style.right='0';
readingMask.style.bottom='0';
readingMask.style.zIndex='2147483001';
readingMask.style.pointerEvents='none';
readingMask.style.display='none';
body.appendChild(readingMask);

var i18n={
  en:{
    profiles:'Profiles',
    profileBlind:'Blind',
    profileLowVision:'Low Vision',
    profileMotor:'Motor',
    profileDyslexia:'Dyslexia',
    profileADHD:'ADHD',
    profileSeizure:'Seizure Safe',
    profileClear:'Clear Profile',
    textScale:'Text Size',
    highContrast:'High Contrast',
    contrastMode:'Contrast Mode',
    contrastNone:'None',
    contrastDark:'Dark',
    contrastLight:'Light',
    contrastInvert:'Invert',
    contrastSmart:'Smart',
    readableFont:'Readable Font',
    pauseAnimations:'Pause Animations',
    highlightLinks:'Highlight Links',
    textSpacing:'Text Spacing',
    spacingNormal:'Normal',
    spacingModerate:'Moderate',
    spacingHeavy:'Heavy',
    lineHeight:'Line Height',
    lineNormal:'Normal',
    lineRelaxed:'Relaxed',
    lineLoose:'Loose',
    textAlign:'Text Align',
    alignDefault:'Default',
    alignLeft:'Left',
    alignCenter:'Center',
    alignJustify:'Justify',
    saturation:'Saturation',
    saturationNormal:'Normal',
    saturationLow:'Low',
    saturationHigh:'High',
    saturationMono:'Mono',
    hideImages:'Hide Images',
    readingGuide:'Reading Guide',
    readingMask:'Reading Mask',
    bigCursor:'Big Cursor',
    pageStructure:'Page Structure',
    reset:'Reset',
    statement:'Accessibility statement',
    reportIssue:'Report an accessibility issue',
    language:'Language',
    closePanel:'Close accessibility settings',
    launcherAccessibilityMenu:'accessibility menu',
    panelSubtitle:'Accessibility preferences',
    panelHelper:'Tune display, motion, and navigation for this site.',
    sectionReadingVision:'Reading & vision',
    sectionMotion:'Motion & display',
    sectionNavigation:'Navigation',
    hintPauseAnimations:'Temporarily stop non-essential animations',
    ann:{
      highContrastOn:'High contrast on',
      highContrastOff:'High contrast off',
      readableFontOn:'Readable font on',
      readableFontOff:'Readable font off',
      pauseAnimationsOn:'Animations paused',
      pauseAnimationsOff:'Animations playing',
      highlightLinksOn:'Links highlighted',
      highlightLinksOff:'Link highlighting off',
      hideImagesOn:'Images hidden',
      hideImagesOff:'Images shown',
      readingGuideOn:'Reading guide on',
      readingGuideOff:'Reading guide off',
      readingMaskOn:'Reading mask on',
      readingMaskOff:'Reading mask off',
      bigCursorOn:'Large cursor on',
      bigCursorOff:'Large cursor off',
      contrastModeSet:'Contrast mode: {label}',
      textSpacingSet:'Text spacing: {label}',
      lineHeightSet:'Line height: {label}',
      textAlignSet:'Text alignment: {label}',
      saturationSet:'Saturation: {label}',
      languageSet:'Language: {label}',
      textSizePercent:'Text size {n} percent',
      textSizeMin:'Text size already at minimum',
      textSizeMax:'Text size already at maximum',
      jumpHeadingsOk:'Moved to first heading',
      jumpHeadingsNone:'No headings found on this page',
      jumpLinksOk:'Moved to first link',
      jumpLinksNone:'No links found on this page',
      profileAppliedPrefix:'Profile applied:',
      settingsReset:'Accessibility settings reset',
      saveFailed:'Settings could not be saved on this device. Your changes still apply for this visit.'
    }
  },
  es:{
    profiles:'Perfiles',
    profileBlind:'Ceguera',
    profileLowVision:'Baja vision',
    profileMotor:'Motriz',
    profileDyslexia:'Dislexia',
    profileADHD:'TDAH',
    profileSeizure:'Seguro epilepsia',
    profileClear:'Limpiar perfil',
    textScale:'Tamano de texto',
    highContrast:'Alto contraste',
    contrastMode:'Modo de contraste',
    contrastNone:'Ninguno',
    contrastDark:'Oscuro',
    contrastLight:'Claro',
    contrastInvert:'Invertir',
    contrastSmart:'Inteligente',
    readableFont:'Fuente legible',
    pauseAnimations:'Pausar animaciones',
    highlightLinks:'Resaltar enlaces',
    textSpacing:'Espaciado de texto',
    spacingNormal:'Normal',
    spacingModerate:'Moderado',
    spacingHeavy:'Amplio',
    lineHeight:'Altura de linea',
    lineNormal:'Normal',
    lineRelaxed:'Relajada',
    lineLoose:'Amplia',
    textAlign:'Alineacion',
    alignDefault:'Predeterminado',
    alignLeft:'Izquierda',
    alignCenter:'Centro',
    alignJustify:'Justificado',
    saturation:'Saturacion',
    saturationNormal:'Normal',
    saturationLow:'Baja',
    saturationHigh:'Alta',
    saturationMono:'Mono',
    hideImages:'Ocultar imagenes',
    readingGuide:'Guia de lectura',
    readingMask:'Mascara de lectura',
    bigCursor:'Cursor grande',
    pageStructure:'Estructura',
    reset:'Restablecer',
    statement:'Declaracion de accesibilidad',
    reportIssue:'Reportar problema',
    language:'Idioma',
    closePanel:'Cerrar panel de accesibilidad',
    launcherAccessibilityMenu:'menu de accesibilidad',
    panelSubtitle:'Preferencias de accesibilidad',
    panelHelper:'Ajusta visualizacion, movimiento y navegacion en este sitio.',
    sectionReadingVision:'Lectura y vision',
    sectionMotion:'Movimiento y pantalla',
    sectionNavigation:'Navegacion',
    hintPauseAnimations:'Pausa animaciones no esenciales'
  },
  'pt-BR':{
    profiles:'Perfis',
    profileBlind:'Cegueira',
    profileLowVision:'Baixa visao',
    profileMotor:'Motora',
    profileDyslexia:'Dislexia',
    profileADHD:'TDAH',
    profileSeizure:'Seguro convulsao',
    profileClear:'Limpar perfil',
    textScale:'Tamanho do texto',
    highContrast:'Alto contraste',
    contrastMode:'Modo de contraste',
    contrastNone:'Nenhum',
    contrastDark:'Escuro',
    contrastLight:'Claro',
    contrastInvert:'Inverter',
    contrastSmart:'Inteligente',
    readableFont:'Fonte legivel',
    pauseAnimations:'Pausar animacoes',
    highlightLinks:'Destacar links',
    textSpacing:'Espacamento',
    spacingNormal:'Normal',
    spacingModerate:'Moderado',
    spacingHeavy:'Alto',
    lineHeight:'Altura da linha',
    lineNormal:'Normal',
    lineRelaxed:'Confortavel',
    lineLoose:'Alta',
    textAlign:'Alinhamento',
    alignDefault:'Padrao',
    alignLeft:'Esquerda',
    alignCenter:'Centro',
    alignJustify:'Justificado',
    saturation:'Saturacao',
    saturationNormal:'Normal',
    saturationLow:'Baixa',
    saturationHigh:'Alta',
    saturationMono:'Mono',
    hideImages:'Ocultar imagens',
    readingGuide:'Guia de leitura',
    readingMask:'Mascara de leitura',
    bigCursor:'Cursor grande',
    pageStructure:'Estrutura',
    reset:'Redefinir',
    statement:'Declaracao de acessibilidade',
    reportIssue:'Reportar problema',
    language:'Idioma',
    closePanel:'Fechar painel de acessibilidade',
    launcherAccessibilityMenu:'menu de acessibilidade',
    panelSubtitle:'Preferencias de acessibilidade',
    panelHelper:'Ajuste exibicao, movimento e navegacao neste site.',
    sectionReadingVision:'Leitura e visao',
    sectionMotion:'Movimento e tela',
    sectionNavigation:'Navegacao',
    hintPauseAnimations:'Pausar animacoes nao essenciais'
  },
  he:{
    profiles:'פרופילים',
    profileBlind:'לקות ראייה מלאה',
    profileLowVision:'ראייה ירודה',
    profileMotor:'מוגבלות מוטורית',
    profileDyslexia:'דיסלקציה',
    profileADHD:'הפרעת קשב',
    profileSeizure:'רגישות להתקפים',
    profileClear:'נקה פרופיל',
    textScale:'גודל טקסט',
    highContrast:'ניגודיות גבוהה',
    contrastMode:'מצב ניגודיות',
    contrastNone:'ללא',
    contrastDark:'כהה',
    contrastLight:'בהיר',
    contrastInvert:'היפוך',
    contrastSmart:'חכם',
    readableFont:'גופן קריא',
    pauseAnimations:'השהה אנימציות',
    highlightLinks:'הדגשת קישורים',
    textSpacing:'ריווח טקסט',
    spacingNormal:'רגיל',
    spacingModerate:'בינוני',
    spacingHeavy:'רחב',
    lineHeight:'גובה שורה',
    lineNormal:'רגיל',
    lineRelaxed:'מרווח',
    lineLoose:'רחב',
    textAlign:'יישור טקסט',
    alignDefault:'ברירת מחדל',
    alignLeft:'שמאל',
    alignCenter:'מרכז',
    alignJustify:'מיושר',
    saturation:'ריווי צבע',
    saturationNormal:'רגיל',
    saturationLow:'נמוך',
    saturationHigh:'גבוה',
    saturationMono:'שחור-לבן',
    hideImages:'הסתר תמונות',
    readingGuide:'מדריך קריאה',
    readingMask:'מסכת קריאה',
    bigCursor:'סמן גדול',
    pageStructure:'מבנה דף',
    reset:'איפוס',
    statement:'הצהרת נגישות',
    reportIssue:'דיווח על נגישות',
    language:'שפה',
    closePanel:'סגירת לוח נגישות',
    launcherAccessibilityMenu:'תפריט נגישות',
    panelSubtitle:'העדפות נגישות',
    panelHelper:'כוונון תצוגה, תנועה וניווט באתר זה.',
    sectionReadingVision:'קריאה וראייה',
    sectionMotion:'תנועה ותצוגה',
    sectionNavigation:'ניווט',
    hintPauseAnimations:'השהיית אנימציות שאינן חיוניות',
    ann:{
      highContrastOn:'ניגודיות גבוהה פועלת',
      highContrastOff:'ניגודיות גבוהה כבויה',
      readableFontOn:'גופן קריא פועל',
      readableFontOff:'גופן קריא כבוי',
      pauseAnimationsOn:'אנימציות מושהות',
      pauseAnimationsOff:'אנימציות פועלות',
      highlightLinksOn:'קישורים מודגשים',
      highlightLinksOff:'הדגשת קישורים כבויה',
      hideImagesOn:'תמונות מוסתרות',
      hideImagesOff:'תמונות מוצגות',
      readingGuideOn:'מדריך קריאה פועל',
      readingGuideOff:'מדריך קריאה כבוי',
      readingMaskOn:'מסכת קריאה פועלת',
      readingMaskOff:'מסכת קריאה כבויה',
      bigCursorOn:'סמן גדול פועל',
      bigCursorOff:'סמן גדול כבוי',
      contrastModeSet:'מצב ניגודיות: {label}',
      textSpacingSet:'ריווח טקסט: {label}',
      lineHeightSet:'גובה שורה: {label}',
      textAlignSet:'יישור טקסט: {label}',
      saturationSet:'ריווי צבע: {label}',
      languageSet:'שפה: {label}',
      textSizePercent:'גודל טקסט {n} אחוז',
      textSizeMin:'גודל הטקסט כבר במינימום',
      textSizeMax:'גודל הטקסט כבר במקסימום',
      jumpHeadingsOk:'עבר לכותרת הראשונה',
      jumpHeadingsNone:'לא נמצאו כותרות בדף',
      jumpLinksOk:'עבר לקישור הראשון',
      jumpLinksNone:'לא נמצאו קישורים בדף',
      profileAppliedPrefix:'הוחל פרופיל:',
      settingsReset:'הגדרות הנגישות אופסו',
      saveFailed:'לא ניתן לשמור הגדרות במכשיר זה. השינויים נשארים לביקור זה.'
    }
  }
};

function t(key){
  var lang=i18n[state.language]?state.language:'en';
  return (i18n[lang]&&i18n[lang][key])||i18n.en[key]||key;
}

function ann(key){
  var pack=(i18n[state.language]&&i18n[state.language].ann)||i18n.en.ann;
  if(!pack||!pack[key]){pack=i18n.en.ann;}
  return (pack&&pack[key])||'';
}

function annFmt(key,label){
  var s=ann(key);
  return s.replace('{label}',String(label)).replace('{n}',String(label));
}

function announce(text){
  if(!text||!liveRegionRef){return;}
  if(text===lastAnnounce&&Date.now()-lastAnnounceTs<300){return;}
  lastAnnounce=text;
  lastAnnounceTs=Date.now();
  liveRegionRef.textContent='';
  setTimeout(function(){liveRegionRef.textContent=text;},0);
}

function saveState(){
  try{
    var data={
      textScale:state.textScale,
      highContrast:state.highContrast,
      readableFont:state.readableFont,
      pauseAnimations:state.pauseAnimations,
      highlightLinks:state.highlightLinks,
      contrastMode:state.contrastMode,
      textSpacing:state.textSpacing,
      lineHeight:state.lineHeight,
      textAlign:state.textAlign,
      saturation:state.saturation,
      hideImages:state.hideImages,
      readingGuide:state.readingGuide,
      readingMask:state.readingMask,
      bigCursor:state.bigCursor,
      language:state.language,
      motionPreference:state.motionPreference
    };
    localStorage.setItem(storageKey,JSON.stringify(data));
  }catch(_e){
    announce(ann('saveFailed'));
  }
}

function hydrateState(){
  try{
    var raw=localStorage.getItem(storageKey);
    if(!raw){return;}
    var parsed=JSON.parse(raw);
    if(!parsed||typeof parsed!=='object'){return;}
    Object.assign(state,parsed);
    if(!i18n[state.language]){state.language=config.language||'en';}
    if(state.motionPreference!=='reduce'&&state.motionPreference!=='allow'&&state.motionPreference!=='system'){
      state.motionPreference='system';
    }
  }catch(_e){}
}

function effectiveReducedMotion(){
  if(state.motionPreference==='reduce'){return true;}
  if(state.motionPreference==='allow'){return false;}
  try{
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }catch(_e){
    return false;
  }
}

function shouldMinimizeMotion(){
  return state.pauseAnimations||effectiveReducedMotion();
}

function syncWidgetMotionClass(){
  try{
    var w=document.getElementById('carbon-a11y-widget');
    var sh=w&&w.shadowRoot&&w.shadowRoot.querySelector('.ca-assist-shell');
    if(!sh){return;}
    if(shouldMinimizeMotion()){
      sh.classList.add('ca-assist-reduce-motion');
    }else{
      sh.classList.remove('ca-assist-reduce-motion');
    }
  }catch(_e){}
}

function ensureLocaleFonts(){
  if(window.__caA11yLocaleFonts){return;}
  window.__caA11yLocaleFonts=true;
  var l=document.createElement('link');
  l.rel='stylesheet';
  l.href='https://fonts.googleapis.com/css2?family=Noto+Sans+Hebrew:wght@400;600&family=Noto+Sans:wght@400;600&display=swap';
  document.head.appendChild(l);
}

function syncShellLocaleClass(){
  try{
    var w=document.getElementById('carbon-a11y-widget');
    var sh=w&&w.shadowRoot&&w.shadowRoot.querySelector('.ca-assist-shell');
    if(!sh){return;}
    if(state.language==='he'){
      sh.classList.add('ca-assist-lang-he');
    }else{
      sh.classList.remove('ca-assist-lang-he');
    }
  }catch(_e){}
}

function syncDocumentLangDir(){
  try{
    if(state.language==='he'){
      root.setAttribute('dir','rtl');
      root.setAttribute('lang','he');
    }else{
      root.removeAttribute('dir');
      if(state.language==='es'){root.setAttribute('lang','es');}
      else if(state.language==='pt-BR'){root.setAttribute('lang','pt-BR');}
      else{root.setAttribute('lang','en');}
    }
  }catch(_e){}
}

function renderGlobalStyles(){
  ensureLocaleFonts();
  var css=[];
  var spacing='normal';
  if(state.textSpacing==='moderate'){spacing='0.04em';}
  if(state.textSpacing==='heavy'){spacing='0.08em';}
  var line='1.5';
  if(state.lineHeight==='relaxed'){line='1.75';}
  if(state.lineHeight==='loose'){line='2';}
  var align='initial';
  if(state.textAlign==='left'){align='left';}
  if(state.textAlign==='center'){align='center';}
  if(state.textAlign==='justify'){align='justify';}
  var sat='none';
  if(state.saturation==='low'){sat='saturate(0.7)';}
  if(state.saturation==='high'){sat='saturate(1.35)';}
  if(state.saturation==='mono'){sat='grayscale(1)';}
  css.push(':root{font-size:'+state.textScale+'%;}');
  if(state.contrastMode==='dark'||state.highContrast){css.push('html,body{background:#000 !important;color:#fff !important;}');}
  if(state.contrastMode==='light'){css.push('html,body{background:#fff !important;color:#111 !important;}');}
  if(state.contrastMode==='invert'){css.push('html{filter:invert(1) hue-rotate(180deg) !important;} img,video{filter:invert(1) hue-rotate(180deg) !important;}');}
  if(state.contrastMode==='smart'){css.push('html,body{background:#0b0b0b !important;color:#f8fafc !important;} a{color:#93c5fd !important;}');}
  if(state.readableFont){css.push('html,body,*{font-family:"Atkinson Hyperlegible","Segoe UI",Arial,sans-serif !important;}');}
  if(state.pauseAnimations){css.push('*,*::before,*::after{animation:none !important;transition:none !important;scroll-behavior:auto !important;} video,iframe{animation:none !important;}');}
  if(state.highlightLinks){css.push('a{outline:2px dashed #f59e0b !important;outline-offset:2px !important;border-radius:4px;}');}
  if(state.hideImages){css.push('img,svg,picture,video,canvas{visibility:hidden !important;}');}
  if(state.bigCursor){css.push('html,body,*{cursor:url("data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'32\\' height=\\'32\\'><circle cx=\\'12\\' cy=\\'12\\' r=\\'9\\' fill=\\'black\\' stroke=\\'white\\' stroke-width=\\'2\\'/></svg>") 12 12,auto !important;}');}
  if(spacing!=='normal'){css.push('p,li,button,input,textarea,select,a,span,div{letter-spacing:'+spacing+' !important;word-spacing:'+spacing+' !important;}');}
  if(line!=='1.5'){css.push('p,li,button,input,textarea,select,a,span,div{line-height:'+line+' !important;}');}
  if(align!=='initial'){css.push('p,li,div,section,article,main{text-align:'+align+' !important;}');}
  if(sat!=='none'){css.push('html{filter:'+sat+' !important;}');}
  styleTag.textContent=css.join("\\n");
  guideLine.style.display=state.readingGuide?'block':'none';
  readingMask.style.display=state.readingMask?'block':'none';
  syncDocumentLangDir();
  syncShellLocaleClass();
  syncWidgetMotionClass();
}

function track(eventName,payload){
  try{
    var dedupBase=eventName+"::"+JSON.stringify(payload||{});
    var dedupNow=Date.now();
    window.__carbonA11yTrackTimes=window.__carbonA11yTrackTimes||{};
    var trackTimes=window.__carbonA11yTrackTimes;
    var throttleMs=700;
    if(eventName==="panel_open"||eventName==="panel_close"){throttleMs=250;}
    var lastTs=Number(trackTimes[dedupBase]||0);
    if(dedupNow-lastTs<throttleMs){return;}
    trackTimes[dedupBase]=dedupNow;

    var bodyPayload=JSON.stringify({scope:scope,eventName:eventName,payload:payload||{}});
    if(navigator.sendBeacon){
      var blob=new Blob([bodyPayload],{type:"application/json"});
      navigator.sendBeacon(usageEndpoint,blob);
      return;
    }
    fetch(usageEndpoint,{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:bodyPayload,
      keepalive:true
    }).catch(function(){});
  }catch(_e){}
}

function switchAnnounceKey(key,enabled){
  var mapOn={
    highContrast:'highContrastOn',
    readableFont:'readableFontOn',
    pauseAnimations:'pauseAnimationsOn',
    highlightLinks:'highlightLinksOn',
    hideImages:'hideImagesOn',
    readingGuide:'readingGuideOn',
    readingMask:'readingMaskOn',
    bigCursor:'bigCursorOn'
  };
  var mapOff={
    highContrast:'highContrastOff',
    readableFont:'readableFontOff',
    pauseAnimations:'pauseAnimationsOff',
    highlightLinks:'highlightLinksOff',
    hideImages:'hideImagesOff',
    readingGuide:'readingGuideOff',
    readingMask:'readingMaskOff',
    bigCursor:'bigCursorOff'
  };
  var k=enabled?mapOn[key]:mapOff[key];
  return k?ann(k):'';
}

function makeAction(label,key,onToggle,hintText){
  var btn=document.createElement('button');
  btn.type='button';
  btn.className='ca-assist-toggle';
  btn.setAttribute('role','switch');
  btn.setAttribute('data-carbon-key','switch-'+String(key));
  var lid='ca-assist-lbl-'+String(key);
  var textCol=document.createElement('span');
  textCol.className='ca-assist-toggle__text';
  var labelNode=document.createElement('span');
  labelNode.className='ca-assist-toggle__label';
  labelNode.id=lid;
  labelNode.textContent=label;
  btn.setAttribute('aria-labelledby',lid);
  textCol.appendChild(labelNode);
  if(hintText){
    var hint=document.createElement('span');
    hint.className='ca-assist-toggle__hint';
    hint.textContent=hintText;
    textCol.appendChild(hint);
  }
  var sw=document.createElement('span');
  sw.className='ca-assist-switch';
  sw.setAttribute('aria-hidden','true');
  var switchTrack=document.createElement('span');
  switchTrack.className='ca-assist-switch__track';
  var thumb=document.createElement('span');
  thumb.className='ca-assist-switch__thumb';
  switchTrack.appendChild(thumb);
  sw.appendChild(switchTrack);
  btn.appendChild(textCol);
  btn.appendChild(sw);
  function paint(){
    var enabled=Boolean(state[key]);
    btn.setAttribute('aria-checked',enabled?'true':'false');
    if(enabled){btn.classList.add('is-on');}else{btn.classList.remove('is-on');}
  }
  paint();
  btn.addEventListener('click',function(){
    var prev=Boolean(state[key]);
    state[key]=!state[key];
    if(state[key]===prev){return;}
    paint();
    onToggle();
    saveState();
    track('toggle_'+String(key),{enabled:state[key]});
    announce(switchAnnounceKey(key,state[key]));
  });
  btn.addEventListener('keydown',function(ev){
    if(ev.key===' '||ev.key==='Spacebar'){
      ev.preventDefault();
      btn.click();
    }
  });
  return btn;
}

function makeCommandAction(label,badgeText,onClick,dataKey){
  var btn=document.createElement('button');
  btn.type='button';
  btn.className='ca-assist-navrow';
  if(dataKey){btn.setAttribute('data-carbon-key',String(dataKey));}
  var labelNode=document.createElement('span');
  labelNode.className='ca-assist-navrow__label';
  labelNode.textContent=label;
  var right=document.createElement('span');
  right.className='ca-assist-navrow__right';
  var badge=document.createElement('span');
  badge.className='ca-assist-navrow__val';
  badge.textContent=String(badgeText||'');
  var chev=document.createElement('span');
  chev.className='ca-assist-navrow__chev';
  chev.setAttribute('aria-hidden','true');
  chev.textContent='›';
  right.appendChild(badge);
  right.appendChild(chev);
  btn.appendChild(labelNode);
  btn.appendChild(right);
  btn.addEventListener('click',function(){onClick();});
  return btn;
}

function makeRadioGroup(labelText,key,options,onToggle,annKey,compact){
  compact=Boolean(compact);
  var wrap=document.createElement('div');
  wrap.className='ca-assist-field'+(compact?' ca-assist-field--compact':'');
  var lid='ca-assist-rg-lbl-'+String(key);
  var text=document.createElement('div');
  text.id=lid;
  text.className='ca-assist-field__name'+(compact?' ca-assist-field__name--compact':'');
  text.textContent=labelText;
  var group=document.createElement('div');
  group.setAttribute('role','radiogroup');
  group.setAttribute('aria-labelledby',lid);
  var optsEl=document.createElement('div');
  optsEl.className='ca-assist-seg'+(compact?' ca-assist-seg--tight':'');
  var radios=[];
  function labelForValue(val){
    for(var j=0;j<options.length;j++){
      if(String(options[j].value)===String(val)){return options[j].label;}
    }
    return String(val);
  }
  function syncRadios(){
    var cur=String(state[key]||options[0].value);
    for(var i=0;i<radios.length;i++){
      var r=radios[i];
      var on=String(r._val)===cur;
      r.setAttribute('aria-checked',on?'true':'false');
      r.tabIndex=on?0:-1;
    }
  }
  function selectValue(val,fromKeyboard){
    var v=String(val);
    if(String(state[key])===v){return;}
    state[key]=v;
    syncRadios();
    onToggle();
    saveState();
    track('set_'+String(key),{value:state[key]});
    announce(annFmt(annKey,labelForValue(v)));
  }
  for(var i=0;i<options.length;i++){
    (function(opt){
      var b=document.createElement('button');
      b.type='button';
      b.className='ca-assist-seg__btn';
      b.setAttribute('role','radio');
      b.setAttribute('data-carbon-key','rg-'+String(key)+'-'+String(opt.value));
      b.textContent=opt.label;
      b._val=String(opt.value);
      b.addEventListener('click',function(){selectValue(b._val,false);});
      b.addEventListener('keydown',function(ev){
        var idx=radios.indexOf(b);
        if(ev.key==='ArrowDown'||ev.key==='ArrowRight'){
          ev.preventDefault();
          var n=(idx+1)%radios.length;
          selectValue(radios[n]._val,true);
          radios[n].focus();
        }else if(ev.key==='ArrowUp'||ev.key==='ArrowLeft'){
          ev.preventDefault();
          var p=(idx-1+radios.length)%radios.length;
          selectValue(radios[p]._val,true);
          radios[p].focus();
        }else if(ev.key==='Home'){
          ev.preventDefault();
          selectValue(radios[0]._val,true);
          radios[0].focus();
        }else if(ev.key==='End'){
          ev.preventDefault();
          selectValue(radios[radios.length-1]._val,true);
          radios[radios.length-1].focus();
        }else if(ev.key===' '||ev.key==='Spacebar'){
          ev.preventDefault();
          selectValue(b._val,true);
        }
      });
      radios.push(b);
      optsEl.appendChild(b);
    })(options[i]);
  }
  state[key]=String(state[key]||options[0].value);
  syncRadios();
  group.appendChild(optsEl);
  wrap.appendChild(text);
  wrap.appendChild(group);
  return wrap;
}

function makeSectionTitle(text){
  var node=document.createElement('h2');
  node.textContent=text;
  node.className='ca-assist-sec';
  return node;
}

function makeTextScaleRow(){
  var wrap=document.createElement('div');
  wrap.className='ca-assist-field';
  var name=document.createElement('div');
  name.className='ca-assist-field__name';
  name.textContent=t('textScale');
  var row=document.createElement('div');
  row.className='ca-assist-step';
  var minus=document.createElement('button');
  minus.type='button';
  minus.className='ca-assist-step__btn';
  minus.setAttribute('data-carbon-key','cmd-text-smaller');
  minus.setAttribute('aria-label',t('textScale')+' smaller');
  minus.textContent='−';
  minus.addEventListener('click',function(){
    if(state.textScale<=85){announce(ann('textSizeMin'));return;}
    state.textScale=Math.max(85,state.textScale-10);renderGlobalStyles();saveState();track('text_scale_change',{value:state.textScale});rerenderPanel();
    clearTimeout(scaleAnnounceTimer);
    scaleAnnounceTimer=setTimeout(function(){announce(annFmt('textSizePercent',state.textScale));},150);
  });
  var val=document.createElement('span');
  val.className='ca-assist-step__val';
  val.textContent=String(state.textScale)+'%';
  var plus=document.createElement('button');
  plus.type='button';
  plus.className='ca-assist-step__btn';
  plus.setAttribute('data-carbon-key','cmd-text-larger');
  plus.setAttribute('aria-label',t('textScale')+' larger');
  plus.textContent='+';
  plus.addEventListener('click',function(){
    if(state.textScale>=170){announce(ann('textSizeMax'));return;}
    state.textScale=Math.min(170,state.textScale+10);renderGlobalStyles();saveState();track('text_scale_change',{value:state.textScale});rerenderPanel();
    clearTimeout(scaleAnnounceTimer);
    scaleAnnounceTimer=setTimeout(function(){announce(annFmt('textSizePercent',state.textScale));},150);
  });
  row.appendChild(minus);
  row.appendChild(val);
  row.appendChild(plus);
  wrap.appendChild(name);
  wrap.appendChild(row);
  return wrap;
}

function makeToolCard(opts){
  var card=document.createElement('button');
  card.type='button';
  card.className='ca-assist-tool';
  var icon=document.createElement('div');
  icon.className='ca-assist-tool-icon';
  icon.textContent=opts.icon;
  var label=document.createElement('div');
  label.className='ca-assist-tool-label';
  label.textContent=opts.label;
  var stateBadge=document.createElement('div');
  stateBadge.className='ca-assist-tool-state';
  function paint(){
    if(opts.getValue()){
      stateBadge.textContent='ON';
      card.classList.add('is-on');
    }else{
      stateBadge.textContent='OFF';
      card.classList.remove('is-on');
    }
  }
  paint();
  card.addEventListener('click',function(){
    opts.onToggle();
    paint();
  });
  card.appendChild(stateBadge);
  card.appendChild(icon);
  card.appendChild(label);
  return card;
}

function makeToolCardAction(opts){
  var card=document.createElement('button');
  card.type='button';
  card.className='ca-assist-tool';
  var icon=document.createElement('div');
  icon.className='ca-assist-tool-icon';
  icon.textContent=opts.icon;
  var label=document.createElement('div');
  label.className='ca-assist-tool-label';
  label.textContent=opts.label;
  var stateBadge=document.createElement('div');
  stateBadge.className='ca-assist-tool-state';
  function paint(){
    var active=Boolean(opts.isActive&&opts.isActive());
    var stateText=String((opts.getStateText&&opts.getStateText())||'');
    stateBadge.textContent=stateText;
    stateBadge.removeAttribute('data-kind');
    if(stateText==='jump'){stateBadge.setAttribute('data-kind','jump');}
    if(active){card.classList.add('is-on');}else{card.classList.remove('is-on');}
  }
  paint();
  card.addEventListener('click',function(){
    opts.onClick();
    paint();
  });
  card.appendChild(stateBadge);
  card.appendChild(icon);
  card.appendChild(label);
  return card;
}

function applyProfile(name){
  if(name==='clear'){
    state.textScale=100;
    state.highContrast=false;
    state.readableFont=false;
    state.pauseAnimations=false;
    state.highlightLinks=false;
    state.contrastMode='none';
    state.textSpacing='normal';
    state.lineHeight='normal';
    state.textAlign='default';
    state.saturation='normal';
    state.hideImages=false;
    state.readingGuide=false;
    state.readingMask=false;
    state.bigCursor=false;
    state.language=config.language||'en';
  }else if(name==='blind'){
    state.textScale=120;
    state.contrastMode='dark';
    state.readableFont=true;
    state.highlightLinks=true;
    state.bigCursor=true;
    state.pauseAnimations=true;
  }else if(name==='lowVision'){
    state.textScale=130;
    state.contrastMode='smart';
    state.bigCursor=true;
    state.highlightLinks=true;
  }else if(name==='motor'){
    state.bigCursor=true;
    state.highlightLinks=true;
    state.pauseAnimations=true;
  }else if(name==='dyslexia'){
    state.readableFont=true;
    state.textSpacing='heavy';
    state.lineHeight='loose';
    state.textAlign='left';
  }else if(name==='adhd'){
    state.pauseAnimations=true;
    state.readingMask=true;
    state.highlightLinks=true;
    state.saturation='low';
  }else if(name==='seizure'){
    state.pauseAnimations=true;
    state.saturation='low';
  }
  renderGlobalStyles();
  rerenderPanel();
  saveState();
  track('apply_profile',{name:name});
  if(name==='clear'){
    announce(ann('settingsReset'));
  }else{
    var plMap={blind:t('profileBlind'),lowVision:t('profileLowVision'),motor:t('profileMotor'),dyslexia:t('profileDyslexia'),adhd:t('profileADHD'),seizure:t('profileSeizure')};
    var pl=plMap[name]||name;
    announce(ann('profileAppliedPrefix')+' '+pl);
  }
}

function jumpToSelector(selector,okMsg,noneMsg){
  var nodes=document.querySelectorAll(selector);
  if(!nodes||!nodes.length){
    announce(noneMsg);
    return false;
  }
  var target=nodes[0];
  var behave=shouldMinimizeMotion()?'auto':'smooth';
  if(target&&typeof target.scrollIntoView==='function'){
    target.scrollIntoView({behavior:behave,block:'start'});
  }
  if(target&&typeof target.focus==='function'){
    try{
      target.setAttribute('tabindex','-1');
      target.focus({preventScroll:true});
    }catch(_e){}
  }
  announce(okMsg);
  return true;
}

var lastReadingPointerApplyMs=0;
var readingPointerRaf=0;
var latestPointerY=0;
function applyReadingPointerLayout(y){
  guideLine.style.top=(y+1)+'px';
  var top=Math.max(0,y-45);
  var bottom=Math.max(0,(window.innerHeight||0)-y-45);
  readingMask.style.background='linear-gradient(to bottom, rgba(0,0,0,0.62) 0, rgba(0,0,0,0.62) '+top+'px, rgba(0,0,0,0) '+(top+1)+'px, rgba(0,0,0,0) '+(top+90)+'px, rgba(0,0,0,0.62) '+(top+91)+'px, rgba(0,0,0,0.62) calc(100% - '+bottom+'px))';
}
function flushReadingPointerFromRaf(){
  readingPointerRaf=0;
  lastReadingPointerApplyMs=Date.now();
  applyReadingPointerLayout(latestPointerY);
}
function handlePointerMove(event){
  latestPointerY=event.clientY||0;
  if(shouldMinimizeMotion()){
    var now=Date.now();
    if(now-lastReadingPointerApplyMs<48){
      if(!readingPointerRaf){readingPointerRaf=requestAnimationFrame(flushReadingPointerFromRaf);}
      return;
    }
    lastReadingPointerApplyMs=now;
  }
  applyReadingPointerLayout(latestPointerY);
}

document.addEventListener('mousemove',handlePointerMove,{passive:true});

function buildCarbonWordmark(extraClass){
  var s=document.createElement('span');
  s.className='ca-assist-wordmark'+(extraClass?' '+extraClass:'');
  s.textContent='CARBON ASSIST';
  return s;
}
function buildMarkwordStack(mod){
  var w=document.createElement('span');
  w.className='ca-assist-markword'+(mod?' '+mod:'');
  var c=document.createElement('span');
  c.className='ca-assist-markword__carbon';
  c.textContent='CARBON';
  var a=document.createElement('span');
  a.className='ca-assist-markword__assist';
  a.textContent=' ASSIST';
  w.appendChild(c);
  w.appendChild(a);
  return w;
}
function buildLauncherBrand(){
  var box=document.createElement('span');
  box.className='ca-assist-launcher__cluster';
  var url=String(config.logoUrl||'').trim();
  if(url){
    var img=document.createElement('img');
    img.className='ca-assist-logo-img ca-assist-logo-img--launcher';
    img.alt=String(config.logoAlt||'Carbon Assist');
    img.decoding='async';
    img.loading='lazy';
    img.referrerPolicy='no-referrer';
    img.src=url;
    var mh=Number(config.logoMaxHeight);
    if(!isFinite(mh)||mh<12){mh=26;}
    var v=String(config.logoVariant||'wordmark');
    if(v==='symbol'){mh=Math.min(mh,24);}
    else if(v==='full'){mh=Math.min(mh,30);}
    else{mh=Math.min(mh,28);}
    img.style.maxHeight=mh+'px';
    img.style.width='auto';
    img.style.objectFit='contain';
    img.addEventListener('error',function(){try{box.removeChild(img);}catch(_e){}});
    box.appendChild(img);
  }
  box.appendChild(buildMarkwordStack('ca-assist-markword--launcher'));
  return box;
}
function buildHeaderBrandStrip(){
  var box=document.createElement('div');
  box.className='ca-assist-strip-cluster';
  var url=String(config.logoUrl||'').trim();
  if(url){
    var img=document.createElement('img');
    img.className='ca-assist-logo-img ca-assist-logo-img--strip';
    img.alt=String(config.logoAlt||'Carbon Assist');
    img.decoding='async';
    img.loading='lazy';
    img.referrerPolicy='no-referrer';
    img.src=url;
    var mh=Number(config.logoMaxHeight);
    if(!isFinite(mh)||mh<12){mh=36;}
    mh=Math.min(mh,48);
    img.style.maxHeight=mh+'px';
    img.style.width='auto';
    img.style.objectFit='contain';
    img.addEventListener('error',function(){try{box.removeChild(img);}catch(_e){}});
    box.appendChild(img);
  }
  box.appendChild(buildMarkwordStack('ca-assist-markword--strip'));
  return box;
}
function buildLogoBrand(slot){
  slot=slot||'header';
  var wrap=document.createElement('span');
  wrap.className='ca-assist-brand';
  var url=String(config.logoUrl||'').trim();
  if(url){
    var img=document.createElement('img');
    img.className='ca-assist-logo-img';
    img.alt=String(config.logoAlt||'Carbon Assist');
    img.decoding='async';
    img.loading='lazy';
    img.referrerPolicy='no-referrer';
    img.src=url;
    var mh=Number(config.logoMaxHeight);
    if(!isFinite(mh)||mh<12){mh=slot==='launcher'?22:slot==='footer'?18:32;}
    var v=String(config.logoVariant||'wordmark');
    if(slot==='launcher'){
      if(v==='symbol'){mh=Math.min(mh,22);}
      else if(v==='full'){mh=Math.min(mh,30);}
      else{mh=Math.min(mh,26);}
    }else if(slot==='footer'){
      mh=Math.min(mh,22);
    }else{
      mh=Math.min(mh,44);
    }
    img.style.maxHeight=mh+'px';
    img.style.width='auto';
    img.style.objectFit='contain';
    img.addEventListener('error',function(){
      wrap.innerHTML='';
      var ex=slot==='launcher'?'ca-assist-markword--launcher':slot==='footer'?'ca-assist-markword--footer':'ca-assist-markword--strip';
      wrap.appendChild(buildMarkwordStack(ex));
    });
    wrap.appendChild(img);
    return wrap;
  }
  var ex=slot==='launcher'?'ca-assist-markword--launcher':slot==='footer'?'ca-assist-markword--footer':'ca-assist-markword--strip';
  wrap.appendChild(buildMarkwordStack(ex));
  return wrap;
}

function createWidget(){
  var wrap=document.createElement("div");
  wrap.id="carbon-a11y-widget";
  wrap.style.position="fixed";
  wrap.style.zIndex="2147483000";
  wrap.style.touchAction="none";
  wrap.style.setProperty('--ca-accent',String(config.brandColor||'#6d28d9'));
  wrap.style.setProperty('--ca-panel',String(config.panelColor||'#0b0c0f'));
  wrap.style.border='none';
  wrap.style.outline='none';
  wrap.style.background='transparent';
  wrap.style.boxShadow='none';
  var launcherDrag={active:false,pointerId:null,startX:0,startY:0,origLeft:0,origTop:0,moved:false,suppressClick:false};
  var launcherPosKey=storageKey+'::fabPos';
  function fabSize(){
    return Math.max(60,Math.min(96,Number(config.triggerSize)||76));
  }
  function clampFab(left,top,sz){
    var vw=window.innerWidth||0,vh=window.innerHeight||0,m=8;
    var maxL=Math.max(m,vw-sz-m);
    var maxT=Math.max(m,vh-sz-m);
    return{left:Math.min(maxL,Math.max(m,left)),top:Math.min(maxT,Math.max(m,top))};
  }
  function applyFabPosition(left,top){
    wrap.style.left=Math.round(left)+'px';
    wrap.style.top=Math.round(top)+'px';
    wrap.style.right='auto';
    wrap.style.bottom='auto';
  }
  function saveFabPosition(left,top){
    try{localStorage.setItem(launcherPosKey,JSON.stringify({left:left,top:top}));}catch(_e){}
  }
  function loadFabPosition(){
    try{
      var raw=localStorage.getItem(launcherPosKey);
      if(!raw){return null;}
      var p=JSON.parse(raw);
      if(typeof p.left==='number'&&typeof p.top==='number'){return p;}
    }catch(_e){}
    return null;
  }
  function placeFabInitial(){
    var sz=fabSize();
    var saved=loadFabPosition();
    var vw=window.innerWidth||400,vh=window.innerHeight||800;
    var side=config.sideOffset||18,bot=config.bottomOffset||18;
    var left,top;
    if(saved){
      left=saved.left;
      top=saved.top;
    }else if(config.position==='left'){
      left=side;
      top=vh-sz-bot;
    }else{
      left=vw-sz-side;
      top=vh-sz-bot;
    }
    var c=clampFab(left,top,sz);
    applyFabPosition(c.left,c.top);
  }
  function syncFabShellSize(shellEl,ts){
    shellEl.style.setProperty('--ca-fab-size',ts+'px');
    shellEl.style.setProperty('--ca-launcher-size',ts+'px');
  }
  var shadow=wrap.attachShadow({mode:'open'});
  var scopedStyle=document.createElement('style');
  scopedStyle.textContent=widgetCss;
  var shell=document.createElement('div');
  shell.className='ca-assist-root ca-assist-shell';
  shadow.appendChild(scopedStyle);
  shadow.appendChild(shell);
  var live=document.createElement('div');
  live.setAttribute('role','status');
  live.setAttribute('aria-live','polite');
  live.setAttribute('aria-atomic','true');
  live.className='ca-assist-sr-only';
  shell.appendChild(live);
  liveRegionRef=live;

  var trigger=document.createElement("button");
  trigger.type="button";
  trigger.setAttribute("aria-label",String(config.label||'Accessibility')+', '+t('launcherAccessibilityMenu'));
  trigger.setAttribute("aria-expanded","false");
  var ts=fabSize();
  var glyphSvg='<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.5"/><path d="M5.5 20.5c1.2-4 4.3-6 6.5-6s5.3 2 6.5 6"/></svg>';
  trigger.className='ca-assist-launcher ca-assist-launcher--fab';
  if(config.triggerStyle==='outline'){
    trigger.className+=' ca-assist-launcher--fab-outline';
  }else if(config.triggerStyle==='glass'){
    trigger.className+=' ca-assist-launcher--fab-glass';
  }else{
    trigger.className+=' ca-assist-launcher--fab-solid';
  }
  trigger.style.setProperty('--ca-launcher-size',ts+'px');
  trigger.style.width=ts+'px';
  trigger.style.height=ts+'px';
  var glyphEl=document.createElement('span');
  glyphEl.className='ca-assist-launcher__glyph';
  glyphEl.setAttribute('aria-hidden','true');
  glyphEl.innerHTML=glyphSvg;
  trigger.appendChild(glyphEl);
  syncFabShellSize(shell,ts);

  var panel=document.createElement("div");
  var panelId="ca-assist-panel";
  panel.id=panelId;
  panel.className='ca-assist-panel ca-assist-panel--mono';
  panel.style.display="none";
  panel.style[config.position==="left"?"left":"right"]="0";
  panel.style.width=String(Math.max(330, Number(config.panelWidth||340)))+"px";
  panel.style.borderRadius=String(config.cornerRadius)+"px";
  panel.setAttribute("role","region");
  trigger.setAttribute("aria-controls",panelId);

  var head=document.createElement('div');
  head.className='ca-assist-head';
  var brandRow=document.createElement('div');
  brandRow.className='ca-assist-brand-row';
  var brandLeft=document.createElement('div');
  brandLeft.className='ca-assist-brand-left';
  brandLeft.appendChild(buildHeaderBrandStrip());
  var closeBtn=document.createElement('button');
  closeBtn.type='button';
  closeBtn.id='ca-assist-close';
  closeBtn.className='ca-assist-close';
  closeBtn.setAttribute('data-carbon-key','close');
  closeBtn.setAttribute('aria-label',t('closePanel'));
  closeBtn.textContent='×';
  closeBtn.addEventListener('click',function(){setOpen(false);});
  brandRow.appendChild(brandLeft);
  brandRow.appendChild(closeBtn);
  var titles=document.createElement('div');
  titles.className='ca-assist-head-titles';
  var title=document.createElement('div');
  title.id='ca-assist-panel-title';
  title.className='ca-assist-title';
  title.textContent=config.label;
  var subEl=document.createElement('div');
  subEl.className='ca-assist-panel-sub';
  subEl.textContent=t('panelSubtitle');
  var hel=document.createElement('div');
  hel.id='ca-assist-panel-desc';
  hel.className='ca-assist-helper';
  hel.textContent=t('panelHelper');
  titles.appendChild(title);
  titles.appendChild(subEl);
  titles.appendChild(hel);
  head.appendChild(brandRow);
  head.appendChild(titles);
  panel.setAttribute('aria-labelledby',title.id);
  panel.setAttribute('aria-describedby',hel.id);
  panel.appendChild(head);
  var panelBody=document.createElement('div');
  panelBody.className='ca-assist-panel-body';
  panel.appendChild(panelBody);
  var footer=document.createElement('div');
  footer.className='ca-assist-footer';
  var footerDynamic=document.createElement('div');
  footerDynamic.className='ca-assist-footer-dynamic';
  var footBrand=document.createElement('div');
  footBrand.className='ca-assist-footer-brand';
  footBrand.appendChild(buildLogoBrand('footer'));
  footer.appendChild(footerDynamic);
  footer.appendChild(footBrand);
  panel.appendChild(footer);
  panel.setAttribute('data-ui','v3');

  rerenderPanel=function(){
    var refKey=null;
    try{
      var ae=document.activeElement;
      if(ae&&wrap.shadowRoot&&wrap.shadowRoot.contains(ae)){
        refKey=ae.getAttribute('data-carbon-key');
      }
    }catch(_e){}
    while(panelBody.firstChild){panelBody.removeChild(panelBody.lastChild);}
    while(footerDynamic.firstChild){footerDynamic.removeChild(footerDynamic.lastChild);}

    if(config.features.profiles){
      var profSheet=document.createElement('div');
      profSheet.className='ca-assist-stack';
      profSheet.appendChild(makeSectionTitle(t('profiles')));
      var profilesWrap=document.createElement('div');
      profilesWrap.className='ca-assist-profile-strip';
      var profileDefs=[
        {key:'blind',label:t('profileBlind')},
        {key:'lowVision',label:t('profileLowVision')},
        {key:'motor',label:t('profileMotor')},
        {key:'dyslexia',label:t('profileDyslexia')},
        {key:'adhd',label:t('profileADHD')},
        {key:'seizure',label:t('profileSeizure')}
      ];
      for(var p=0;p<profileDefs.length;p++){
        (function(profile){
          var b=document.createElement('button');
          b.type='button';
          b.className='ca-assist-profile-pill';
          b.setAttribute('data-carbon-key','profile-'+profile.key);
          b.textContent=profile.label;
          b.addEventListener('click',function(){applyProfile(profile.key);});
          profilesWrap.appendChild(b);
        })(profileDefs[p]);
      }
      profSheet.appendChild(profilesWrap);
      var clearProfile=document.createElement('button');
      clearProfile.type='button';
      clearProfile.className='ca-assist-profile-clear';
      clearProfile.setAttribute('data-carbon-key','profile-clear');
      clearProfile.textContent=t('profileClear');
      clearProfile.addEventListener('click',function(){applyProfile('clear');});
      profSheet.appendChild(clearProfile);
      panelBody.appendChild(profSheet);
    }

    var reading=document.createElement('div');
    reading.className='ca-assist-stack';
    if(config.features.textScale){reading.appendChild(makeTextScaleRow());}
    if(config.features.contrastModes){reading.appendChild(makeRadioGroup(t('contrastMode'),'contrastMode',[
      {value:'none',label:t('contrastNone')},
      {value:'dark',label:t('contrastDark')},
      {value:'light',label:t('contrastLight')},
      {value:'invert',label:t('contrastInvert')},
      {value:'smart',label:t('contrastSmart')}
    ],renderGlobalStyles,'contrastModeSet',true));}
    if(config.features.textSpacing){reading.appendChild(makeRadioGroup(t('textSpacing'),'textSpacing',[
      {value:'normal',label:t('spacingNormal')},
      {value:'moderate',label:t('spacingModerate')},
      {value:'heavy',label:t('spacingHeavy')}
    ],renderGlobalStyles,'textSpacingSet',true));}
    if(config.features.lineHeight){reading.appendChild(makeRadioGroup(t('lineHeight'),'lineHeight',[
      {value:'normal',label:t('lineNormal')},
      {value:'relaxed',label:t('lineRelaxed')},
      {value:'loose',label:t('lineLoose')}
    ],renderGlobalStyles,'lineHeightSet',true));}
    if(config.features.textAlign){reading.appendChild(makeRadioGroup(t('textAlign'),'textAlign',[
      {value:'default',label:t('alignDefault')},
      {value:'left',label:t('alignLeft')},
      {value:'center',label:t('alignCenter')},
      {value:'justify',label:t('alignJustify')}
    ],renderGlobalStyles,'textAlignSet',true));}
    if(config.features.saturation){reading.appendChild(makeRadioGroup(t('saturation'),'saturation',[
      {value:'normal',label:t('saturationNormal')},
      {value:'low',label:t('saturationLow')},
      {value:'high',label:t('saturationHigh')},
      {value:'mono',label:t('saturationMono')}
    ],renderGlobalStyles,'saturationSet',true));}
    if(reading.children.length){
      var readBlock=document.createElement('div');
      readBlock.className='ca-assist-sec-group';
      var readHdr=document.createElement('div');
      readHdr.className='ca-assist-sec-group-header';
      readHdr.textContent=t('sectionReadingVision');
      readBlock.appendChild(readHdr);
      readBlock.appendChild(reading);
      panelBody.appendChild(readBlock);
    }

    var motion=document.createElement('div');
    motion.className='ca-assist-stack';
    if(config.features.highContrast){motion.appendChild(makeAction(t('highContrast'),'highContrast',renderGlobalStyles));}
    if(config.features.readableFont){motion.appendChild(makeAction(t('readableFont'),'readableFont',renderGlobalStyles));}
    if(config.features.pauseAnimations){motion.appendChild(makeAction(t('pauseAnimations'),'pauseAnimations',renderGlobalStyles,t('hintPauseAnimations')));}
    if(config.features.highlightLinks){motion.appendChild(makeAction(t('highlightLinks'),'highlightLinks',renderGlobalStyles));}
    if(config.features.hideImages){motion.appendChild(makeAction(t('hideImages'),'hideImages',renderGlobalStyles));}
    if(config.features.readingGuide){motion.appendChild(makeAction(t('readingGuide'),'readingGuide',renderGlobalStyles));}
    if(config.features.readingMask){motion.appendChild(makeAction(t('readingMask'),'readingMask',renderGlobalStyles));}
    if(config.features.bigCursor){motion.appendChild(makeAction(t('bigCursor'),'bigCursor',renderGlobalStyles));}
    if(motion.children.length){
      var motionBlock=document.createElement('div');
      motionBlock.className='ca-assist-sec-group';
      var motionHdr=document.createElement('div');
      motionHdr.className='ca-assist-sec-group-header';
      motionHdr.textContent=t('sectionMotion');
      motionBlock.appendChild(motionHdr);
      motionBlock.appendChild(motion);
      panelBody.appendChild(motionBlock);
    }

    var nav=document.createElement('div');
    nav.className='ca-assist-stack';
    if(config.features.pageStructure){
      nav.appendChild(makeCommandAction('Jump to headings','GO',function(){jumpToSelector('h1,h2,h3,h4,h5,h6',ann('jumpHeadingsOk'),ann('jumpHeadingsNone'));track('jump_headings',{});},'cmd-jump-headings'));
      nav.appendChild(makeCommandAction('Jump to links','GO',function(){jumpToSelector('a[href]',ann('jumpLinksOk'),ann('jumpLinksNone'));track('jump_links',{});},'cmd-jump-links'));
    }
    if(nav.children.length){
      var navBlock=document.createElement('div');
      navBlock.className='ca-assist-sec-group';
      var navHdr=document.createElement('div');
      navHdr.className='ca-assist-sec-group-header';
      navHdr.textContent=t('sectionNavigation');
      navBlock.appendChild(navHdr);
      navBlock.appendChild(nav);
      panelBody.appendChild(navBlock);
    }

    if(config.features.languageSelector){
      var langRow=document.createElement('div');
      langRow.className='ca-assist-footer-lang';
      var globe=document.createElement('span');
      globe.className='ca-assist-footer-globe';
      globe.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';
      langRow.appendChild(globe);
      langRow.appendChild(makeRadioGroup(t('language'),'language',[
        {value:'en',label:'EN'},
        {value:'es',label:'ES'},
        {value:'pt-BR',label:'BR'},
        {value:'he',label:'HE'}
      ],function(){saveState();rerenderPanel();renderGlobalStyles();track('language_change',{value:state.language});},'languageSet',true));
      footerDynamic.appendChild(langRow);
    }

    var statementHref=String(config.statementUrl||'');
    var feedbackHref=String(config.feedbackUrl||'')||(config.supportEmail?'mailto:'+String(config.supportEmail):'');
    if(statementHref){
      var statementLink=document.createElement('a');
      statementLink.className='ca-assist-footlink';
      statementLink.href=statementHref;
      statementLink.target='_blank';
      statementLink.rel='noopener noreferrer';
      statementLink.textContent=t('statement');
      footerDynamic.appendChild(statementLink);
    }
    if(feedbackHref){
      var feedbackLink=document.createElement('a');
      feedbackLink.className='ca-assist-footlink';
      feedbackLink.href=feedbackHref;
      feedbackLink.target=feedbackHref.indexOf('mailto:')===0?'_self':'_blank';
      feedbackLink.rel=feedbackHref.indexOf('mailto:')===0?'':'noopener noreferrer';
      feedbackLink.textContent=t('reportIssue');
      footerDynamic.appendChild(feedbackLink);
    }

    var reset=document.createElement('button');
    reset.type='button';
    reset.className='ca-assist-footreset';
    reset.setAttribute('data-carbon-key','reset-all');
    var resetLab=document.createElement('span');
    resetLab.className='ca-assist-footreset__label';
    resetLab.textContent=t('reset');
    var resetChev=document.createElement('span');
    resetChev.className='ca-assist-footreset__chev';
    resetChev.setAttribute('aria-hidden','true');
    resetChev.textContent='›';
    reset.appendChild(resetLab);
    reset.appendChild(resetChev);
    reset.addEventListener('click',function(){
      applyProfile('clear');
      track('reset',{});
    });
    footerDynamic.appendChild(reset);

    if(panel.style.display!=='none'&&refKey){
      try{
        var nextEl=panel.querySelector('[data-carbon-key="'+refKey+'"]');
        if(nextEl&&typeof nextEl.focus==='function'){nextEl.focus();}
        else if(closeBtn&&typeof closeBtn.focus==='function'){closeBtn.focus();}
      }catch(_e2){
        if(closeBtn&&typeof closeBtn.focus==='function'){closeBtn.focus();}
      }
    }
  };

  function setOpen(next){
    var isOpen=Boolean(next);
    panel.style.display=isOpen?"flex":"none";
    trigger.setAttribute("aria-expanded",isOpen?"true":"false");
    if(isOpen){
      track("panel_open",{position:config.position});
      setTimeout(function(){
        if(closeBtn&&typeof closeBtn.focus==='function'){closeBtn.focus();}
      },0);
    }else{
      trigger.focus();
      track("panel_close",{});
    }
  }
  function onFabPointerMove(e){
    if(!launcherDrag.active||e.pointerId!==launcherDrag.pointerId)return;
    var dx=e.clientX-launcherDrag.startX;
    var dy=e.clientY-launcherDrag.startY;
    if(Math.abs(dx)>4||Math.abs(dy)>4){launcherDrag.moved=true;}
    var sz=fabSize();
    var c=clampFab(launcherDrag.origLeft+dx,launcherDrag.origTop+dy,sz);
    applyFabPosition(c.left,c.top);
  }
  function detachFabDragListeners(){
    window.removeEventListener('pointermove',onFabPointerMove,true);
    window.removeEventListener('pointerup',onFabPointerUp,true);
    window.removeEventListener('pointercancel',onFabPointerUp,true);
  }
  function onFabPointerUp(e){
    if(!launcherDrag.active)return;
    if(e.pointerId!==launcherDrag.pointerId)return;
    launcherDrag.active=false;
    detachFabDragListeners();
    try{trigger.releasePointerCapture(e.pointerId);}catch(_e){}
    trigger.classList.remove('ca-assist-launcher--dragging');
    if(launcherDrag.moved){
      var lx=parseFloat(wrap.style.left)||0;
      var ly=parseFloat(wrap.style.top)||0;
      saveFabPosition(lx,ly);
      launcherDrag.suppressClick=true;
    }
  }
  trigger.addEventListener('pointerdown',function(e){
    if(e.pointerType==='mouse'&&e.button!==0)return;
    launcherDrag.active=true;
    launcherDrag.pointerId=e.pointerId;
    launcherDrag.moved=false;
    launcherDrag.startX=e.clientX;
    launcherDrag.startY=e.clientY;
    launcherDrag.origLeft=parseFloat(wrap.style.left)||0;
    launcherDrag.origTop=parseFloat(wrap.style.top)||0;
    try{trigger.setPointerCapture(e.pointerId);}catch(_e){}
    trigger.classList.add('ca-assist-launcher--dragging');
    window.addEventListener('pointermove',onFabPointerMove,true);
    window.addEventListener('pointerup',onFabPointerUp,true);
    window.addEventListener('pointercancel',onFabPointerUp,true);
  });
  trigger.addEventListener('lostpointercapture',function(e){
    if(!launcherDrag.active||e.pointerId!==launcherDrag.pointerId)return;
    onFabPointerUp(e);
  });
  trigger.addEventListener('click',function(e){
    if(launcherDrag.suppressClick){
      launcherDrag.suppressClick=false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    setOpen(panel.style.display==="none");
  });
  window.addEventListener('resize',function(){
    var sz=fabSize();
    var lx=parseFloat(wrap.style.left)||0;
    var ly=parseFloat(wrap.style.top)||0;
    var c=clampFab(lx,ly,sz);
    if(c.left!==lx||c.top!==ly){
      applyFabPosition(c.left,c.top);
      saveFabPosition(c.left,c.top);
    }
  },{passive:true});
  panel.addEventListener("keydown",function(event){
    if(event.key==="Escape"){
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  });
  document.addEventListener("click",function(event){
    var path=(event.composedPath&&event.composedPath())||[];
    if(path.indexOf(wrap)>=0){return;}
    setOpen(false);
  });

  shell.appendChild(trigger);
  shell.appendChild(panel);
  body.appendChild(wrap);
  wrap.style.width=ts+'px';
  wrap.style.height=ts+'px';
  placeFabInitial();
  syncWidgetMotionClass();
  if(!window.__carbonA11yPrmBound){
    window.__carbonA11yPrmBound=true;
    try{
      var mq=window.matchMedia('(prefers-reduced-motion: reduce)');
      function onPrmChange(){
        if(state.motionPreference==='system'){syncWidgetMotionClass();}
      }
      if(mq.addEventListener){mq.addEventListener('change',onPrmChange);}
      else if(mq.addListener){mq.addListener(onPrmChange);}
    }catch(_e){}
  }
  rerenderPanel();
  syncDocumentLangDir();
  syncShellLocaleClass();
}

hydrateState();
if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",createWidget);}else{createWidget();}
renderGlobalStyles();
})();`;

  return new NextResponse(js, {
    status: 200,
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
