import { NextResponse } from "next/server";
import { loadAccessibilityWidgetConfig } from "@/lib/accessibilityConfigRepository";

const DEFAULT_CONFIG = {
  brandColor: "#6d28d9",
  panelColor: "#111827",
  triggerStyle: "solid",
  position: "right",
  sideOffset: 18,
  bottomOffset: 18,
  triggerSize: 52,
  iconSize: 20,
  panelWidth: 300,
  cornerRadius: 14,
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
        ? Math.max(40, Math.min(76, Math.round(cfg.triggerSize)))
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
  const serializedConfig = JSON.stringify(config);

  const js = `(function(){if(window.__carbonA11yLoaded){return;}window.__carbonA11yLoaded=true;
/* ca-assist-ui v3 studio | Phase A+B a11y (see docs/accessibility-widget-phase-a-b-spec.md)
 * Panel: non-modal named region (not aria-modal). No focus trap — Tab may move into page content.
 * Esc closes only while focus is inside the panel (keydown on panel). Space toggles switches; Arrow/Home/End in radiogroups.
 * Phase C motion: effectiveReducedMotion() + shouldMinimizeMotion() (pauseAnimations wins). Shell class ca-assist-reduce-motion gates widget CSS.
 */
var config=${serializedConfig};
var usageEndpoint=${JSON.stringify(usageEndpoint)};
var scope=${JSON.stringify(scope)};
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
  '.ca-assist-root,.ca-assist-root::before,.ca-assist-root::after,.ca-assist-root *,.ca-assist-root *::before,.ca-assist-root *::after{box-sizing:border-box;margin:0;padding:0;font-family:ui-sans-serif,system-ui,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif !important;font-size:13px;line-height:1.4;letter-spacing:normal !important;text-decoration:none;color:inherit;border:none;background:transparent;box-shadow:none;outline:none}' +
  '.ca-assist-root img{display:block;max-width:100%;height:auto;object-fit:contain}' +
  '.ca-assist-root button,.ca-assist-root [role="switch"],.ca-assist-root [role="radio"]{font:inherit;color:inherit;cursor:pointer;appearance:none;-webkit-appearance:none;border-radius:0}' +
  '.ca-assist-shell{position:relative;display:block;isolation:isolate}' +
  '.ca-assist-launcher{--ca-glow:color-mix(in srgb,var(--ca-accent,#7c3aed) 55%,transparent);position:relative;display:inline-flex;align-items:stretch;min-width:min(320px,calc(100vw - 48px));max-width:min(420px,92vw);border:1px solid rgba(255,255,255,.12);color:#e8e8ed;padding:0 12px 0 14px;cursor:pointer;font-weight:500;transition:transform .2s ease,box-shadow .2s ease,border-color .2s ease;background:linear-gradient(175deg,rgba(38,38,44,.97) 0%,rgba(14,14,16,.99) 48%,rgba(8,8,10,1) 100%);box-shadow:0 14px 44px rgba(0,0,0,.58),inset 0 1px 0 rgba(255,255,255,.09),0 2px 0 var(--ca-glow);backdrop-filter:blur(18px);border-radius:999px}' +
  '.ca-assist-launcher::before{content:"";position:absolute;inset:1px;border-radius:inherit;padding:1px;background:linear-gradient(135deg,rgba(255,255,255,.14),transparent 42%,transparent 58%,rgba(255,255,255,.05));-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none;opacity:.45}' +
  '.ca-assist-launcher::after{content:"";position:absolute;left:8%;right:8%;bottom:4px;height:1px;border-radius:999px;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--ca-accent,#a78bfa) 65%,#fff),transparent);opacity:.5;pointer-events:none}' +
  '.ca-assist-launcher:hover{transform:translateY(-1px);box-shadow:0 18px 50px rgba(0,0,0,.62),inset 0 1px 0 rgba(255,255,255,.1),0 2px 0 var(--ca-glow)}' +
  '.ca-assist-launcher:focus-visible{outline:2px solid color-mix(in srgb,var(--ca-accent,#a78bfa) 70%,#fff);outline-offset:3px}' +
  '.ca-assist-launcher--outline{background:rgba(16,16,20,.82);border:1px solid color-mix(in srgb,var(--ca-accent,#7c3aed) 38%,rgba(255,255,255,.22))}' +
  '.ca-assist-launcher--glass{background:linear-gradient(160deg,rgba(255,255,255,.1),rgba(255,255,255,.02));border:1px solid rgba(255,255,255,.18)}' +
  '.ca-assist-launcher__inner{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;min-height:44px}' +
  '.ca-assist-launcher__brand{display:flex;align-items:center;gap:10px;min-width:0;flex:1}' +
  '.ca-assist-launcher__caption{font-size:10px;font-weight:600;letter-spacing:.14em;text-transform:uppercase !important;color:rgba(248,250,252,.72);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px}' +
  '.ca-assist-launcher__glyph{flex:0 0 auto;width:32px;height:32px;border-radius:999px;display:grid;place-items:center;border:1px solid color-mix(in srgb,var(--ca-accent,#7c3aed) 32%,rgba(255,255,255,.22));background:radial-gradient(circle at 30% 25%,rgba(255,255,255,.08),rgba(0,0,0,.45));color:#e2e8f0;box-shadow:0 0 0 1px rgba(255,255,255,.05) inset,0 0 20px color-mix(in srgb,var(--ca-accent,#7c3aed) 22%,transparent)}' +
  '.ca-assist-launcher__glyph svg{display:block}' +
  '.ca-assist-markword{display:inline-flex;align-items:baseline;gap:0;letter-spacing:.14em !important;text-transform:uppercase !important;white-space:nowrap;font-size:10.5px;font-weight:600;color:#f4f4f5}' +
  '.ca-assist-markword--launcher{font-size:10px;letter-spacing:.16em !important}' +
  '.ca-assist-markword--strip{font-size:11px;letter-spacing:.18em !important}' +
  '.ca-assist-markword--footer{font-size:8px;letter-spacing:.12em !important;opacity:.75}' +
  '.ca-assist-markword__carbon{font-weight:750;color:#fafafa}' +
  '.ca-assist-markword__assist{font-weight:520;color:rgba(228,228,231,.55)}' +
  '.ca-assist-brand{display:inline-flex;align-items:center;min-width:0;max-width:100%}' +
  '.ca-assist-logo-img{display:block;max-width:min(200px,55vw);height:auto;object-fit:contain;filter:drop-shadow(0 1px 2px rgba(0,0,0,.5))}' +
  '.ca-assist-wordmark{font-weight:750;font-size:10px;letter-spacing:.2em !important;color:#f4f4f5;text-transform:uppercase !important;white-space:nowrap}' +
  '.ca-assist-panel{position:absolute;bottom:calc(56px + env(safe-area-inset-bottom,0px));max-width:calc(100vw - 24px);width:100%;color:#d4d4d8;border:1px solid rgba(255,255,255,.1);padding:0;border-radius:20px;display:none;max-height:min(82vh,720px);overflow:hidden;flex-direction:column;background:linear-gradient(180deg,rgba(22,22,26,.98) 0%,color-mix(in srgb,var(--ca-panel,#0c0d10) 92%,#000) 55%,#030304 100%);box-shadow:0 36px 90px rgba(0,0,0,.68),inset 0 1px 0 rgba(255,255,255,.05),0 0 0 1px rgba(255,255,255,.03)}' +
  '.ca-assist-panel,.ca-assist-shell .ca-assist-panel{display:flex}' +
  '.ca-assist-panel::-webkit-scrollbar{width:6px}' +
  '.ca-assist-panel-body::-webkit-scrollbar{width:6px}' +
  '.ca-assist-panel-body::-webkit-scrollbar-thumb{background:rgba(255,255,255,.12);border-radius:999px}' +
  '.ca-assist-head{flex-shrink:0;border-bottom:1px solid rgba(255,255,255,.07);background:linear-gradient(180deg,rgba(255,255,255,.05) 0%,transparent 65%),radial-gradient(100% 90% at 0% 0%,color-mix(in srgb,var(--ca-accent,#7c3aed) 14%,transparent),transparent 55%)}' +
  '.ca-assist-brand-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px 10px;border-bottom:1px solid rgba(255,255,255,.06)}' +
  '.ca-assist-brand-left{display:flex;align-items:center;min-width:0;gap:10px}' +
  '.ca-assist-head-titles{padding:12px 16px 16px}' +
  '.ca-assist-eyebrow{font-size:9px;font-weight:650;letter-spacing:.2em !important;text-transform:uppercase !important;color:rgba(212,212,216,.45);margin-bottom:6px}' +
  '.ca-assist-title{font-weight:580;font-size:17px;letter-spacing:-.02em !important;color:#fafafa;margin:0;line-height:1.2}' +
  '.ca-assist-helper{margin-top:6px;font-size:11.5px;font-weight:450;color:rgba(212,212,216,.52);line-height:1.45;max-width:42ch}' +
  '.ca-assist-close{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:rgba(250,250,250,.9);border-radius:10px;width:32px;height:32px;font-size:16px;line-height:1;cursor:pointer;flex:0 0 auto;transition:background .15s ease,border-color .15s ease}' +
  '.ca-assist-close:hover{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.2)}' +
  '.ca-assist-panel-body{flex:1;min-height:0;overflow:auto;padding:14px 12px 18px;display:flex;flex-direction:column;gap:16px}' +
  '.ca-assist-block{display:flex;flex-direction:column;gap:8px}' +
  '.ca-assist-block > .ca-assist-sec{margin-bottom:0}' +
  '.ca-assist-sheet{display:flex;flex-direction:column;gap:0;border:1px solid rgba(255,255,255,.06);border-radius:14px;background:rgba(255,255,255,.02);overflow:hidden}' +
  '.ca-assist-sheet > .ca-assist-sec{padding:12px 14px 0;margin:0}' +
  '.ca-assist-stack{display:flex;flex-direction:column;gap:0;border:0;border-radius:0;background:transparent;overflow:visible}' +
  '.ca-assist-stack > .ca-assist-sec{margin:0 0 6px 2px;padding:0}' +
  '.ca-assist-launcher__cluster{display:inline-flex;align-items:center;gap:10px;min-width:0;flex:1}' +
  '.ca-assist-strip-cluster{display:flex;align-items:center;gap:10px;min-width:0;flex:1}' +
  '.ca-assist-logo-img--launcher{max-height:28px!important;width:auto!important}' +
  '.ca-assist-logo-img--strip{max-height:40px!important;width:auto!important}' +
  '.ca-assist-panel-sub{margin-top:5px;font-size:11px;font-weight:500;letter-spacing:.03em;color:rgba(212,212,216,.52);line-height:1.35}' +
  '.ca-assist-field--compact{padding:8px 0}' +
  '.ca-assist-field__name--compact{font-size:8.5px;font-weight:600;letter-spacing:.12em;margin-bottom:6px}' +
  '.ca-assist-seg--tight{gap:4px}' +
  '.ca-assist-field--compact .ca-assist-seg__btn{padding:5px 11px;border-radius:999px;min-height:30px;font-size:10.5px;font-weight:500;border-color:rgba(255,255,255,.08);background:rgba(0,0,0,.22)}' +
  '.ca-assist-field--compact .ca-assist-seg__btn:hover{background:rgba(255,255,255,.035)}' +
  '.ca-assist-field--compact .ca-assist-seg__btn[aria-checked="true"]{border-color:rgba(255,255,255,.16);background:rgba(255,255,255,.045);color:#f4f4f5;font-weight:520}' +
  '.ca-assist-sec{font-size:9px;font-weight:650;letter-spacing:.18em !important;text-transform:uppercase !important;color:rgba(212,212,216,.38);margin:0 0 8px 2px}' +
  '.ca-assist-field{padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.05)}' +
  '.ca-assist-field:last-child{border-bottom:0}' +
  '.ca-assist-field__name{font-size:9.5px;font-weight:600;letter-spacing:.1em;text-transform:uppercase !important;color:rgba(212,212,216,.42);margin-bottom:8px}' +
  '.ca-assist-seg{display:flex;flex-wrap:wrap;gap:6px}' +
  '.ca-assist-seg__btn{padding:6px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.1);background:rgba(0,0,0,.28);color:rgba(244,244,245,.88);font-size:11.5px;font-weight:520;min-height:34px;cursor:pointer;transition:background .15s ease,border-color .15s ease,color .15s ease}' +
  '.ca-assist-seg__btn:hover{border-color:rgba(255,255,255,.18);background:rgba(255,255,255,.04)}' +
  '.ca-assist-seg__btn[aria-checked="true"]{border-color:color-mix(in srgb,var(--ca-accent,#7c3aed) 45%,rgba(255,255,255,.25));background:rgba(255,255,255,.06);color:#fafafa;font-weight:560}' +
  '.ca-assist-seg__btn:focus-visible{outline:1px solid color-mix(in srgb,var(--ca-accent,#a78bfa) 55%,#fff);outline-offset:2px}' +
  '.ca-assist-toggle{width:100%;display:flex;align-items:flex-start;justify-content:space-between;gap:14px;text-align:left;border:0;border-bottom:1px solid rgba(255,255,255,.05);background:transparent;color:#e4e4e7;padding:11px 14px;min-height:0;cursor:pointer;transition:background .12s ease}' +
  '.ca-assist-toggle:last-child{border-bottom:0}' +
  '.ca-assist-toggle:hover{background:rgba(255,255,255,.025)}' +
  '.ca-assist-toggle__text{display:flex;flex-direction:column;gap:3px;align-items:flex-start;min-width:0;flex:1}' +
  '.ca-assist-toggle__label{font-size:13px;font-weight:520;line-height:1.25;color:rgba(244,244,245,.95)}' +
  '.ca-assist-toggle__hint{font-size:11px;font-weight:450;line-height:1.35;color:rgba(212,212,216,.42)}' +
  '.ca-assist-switch{flex:0 0 auto;padding-top:1px}' +
  '.ca-assist-switch__track{position:relative;display:block;width:32px;height:17px;border-radius:999px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.06);transition:background .18s ease,border-color .18s ease}' +
  '.ca-assist-toggle.is-on .ca-assist-switch__track{background:color-mix(in srgb,var(--ca-accent,#7c3aed) 48%,rgba(255,255,255,.08));border-color:color-mix(in srgb,var(--ca-accent,#7c3aed) 35%,rgba(255,255,255,.12))}' +
  '.ca-assist-switch__thumb{position:absolute;top:1.5px;left:2px;width:13px;height:13px;border-radius:999px;background:linear-gradient(180deg,#f8fafc,#e2e8f0);box-shadow:0 1px 3px rgba(0,0,0,.4);transition:transform .18s cubic-bezier(.2,.85,.25,1)}' +
  '.ca-assist-toggle.is-on .ca-assist-switch__thumb{transform:translateX(14px)}' +
  '.ca-assist-navrow{width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;text-align:left;border:0;border-bottom:1px solid rgba(255,255,255,.05);background:transparent;color:#e4e4e7;padding:11px 14px;min-height:44px;cursor:pointer;transition:background .12s ease}' +
  '.ca-assist-navrow:last-child{border-bottom:0}' +
  '.ca-assist-navrow:hover{background:rgba(255,255,255,.025)}' +
  '.ca-assist-navrow__label{font-size:13px;font-weight:520;color:rgba(244,244,245,.92)}' +
  '.ca-assist-navrow__right{display:flex;align-items:center;gap:8px}' +
  '.ca-assist-navrow__val{font-size:10px;font-weight:650;letter-spacing:.08em;color:rgba(212,212,216,.45)}' +
  '.ca-assist-navrow__chev{font-size:14px;color:rgba(212,212,216,.35);font-weight:300}' +
  '.ca-assist-step{display:flex;align-items:center;justify-content:center;gap:10px;padding:4px 0 2px}' +
  '.ca-assist-step__btn{width:32px;height:32px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.35);color:#fafafa;font-size:18px;line-height:1;cursor:pointer;transition:background .15s ease,border-color .15s ease}' +
  '.ca-assist-step__btn:hover{border-color:rgba(255,255,255,.2);background:rgba(255,255,255,.06)}' +
  '.ca-assist-step__val{min-width:52px;text-align:center;font-size:12.5px;font-weight:560;letter-spacing:.02em;color:rgba(244,244,245,.9)}' +
  '.ca-assist-profile-strip{display:flex;gap:7px;overflow:auto;padding:4px 2px 8px;scrollbar-width:none}' +
  '.ca-assist-profile-strip::-webkit-scrollbar{display:none}' +
  '.ca-assist-profile-pill{white-space:nowrap;border:1px solid rgba(255,255,255,.1);background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.02));border-radius:999px;padding:7px 12px;font-size:11px;font-weight:550;color:rgba(236,236,241,.9);cursor:pointer;transition:background .14s ease,border-color .14s ease,transform .14s ease}' +
  '.ca-assist-profile-pill:hover{border-color:rgba(255,255,255,.18);background:rgba(255,255,255,.08)}' +
  '.ca-assist-profile-clear{margin-top:4px;width:100%;border:1px dashed rgba(255,255,255,.16);background:transparent;border-radius:11px;padding:9px 11px;font-size:10.5px;font-weight:550;color:rgba(212,212,216,.55);cursor:pointer}' +
  '.ca-assist-profile-clear:hover{background:rgba(255,255,255,.04);color:rgba(250,250,250,.85)}' +
  '.ca-assist-footer{flex-shrink:0;display:flex;flex-direction:column;gap:0;border-top:1px solid rgba(255,255,255,.07);background:linear-gradient(180deg,transparent,rgba(0,0,0,.35))}' +
  '.ca-assist-footer-dynamic{display:flex;flex-direction:column;gap:8px;padding:12px 14px 10px}' +
  '.ca-assist-footer-lang{display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap}' +
  '.ca-assist-footer-lang .ca-assist-field{flex:1;min-width:180px;border:0;padding:0;background:transparent}' +
  '.ca-assist-footer-lang .ca-assist-field__name{display:none}' +
  '.ca-assist-footer-lang .ca-assist-seg{flex-wrap:wrap}' +
  '.ca-assist-footer-globe{flex:0 0 auto;display:grid;place-items:center;width:28px;height:28px;margin-top:2px;border-radius:999px;border:1px solid rgba(255,255,255,.1);background:rgba(0,0,0,.35);color:rgba(212,212,216,.55)}' +
  '.ca-assist-footlink{align-self:flex-start;font-size:10.5px;font-weight:500;color:rgba(196,181,253,.82);text-decoration:none;border-bottom:1px solid rgba(255,255,255,.1);padding-bottom:1px;letter-spacing:.02em}' +
  '.ca-assist-footlink:hover{color:#fff;border-bottom-color:rgba(255,255,255,.28)}' +
  '.ca-assist-footreset{align-self:flex-start;display:inline-flex;align-items:center;gap:6px;border:0;background:transparent;color:rgba(212,212,216,.55);font-size:10.5px;font-weight:550;letter-spacing:.06em;text-transform:uppercase !important;cursor:pointer;padding:2px 0;transition:color .15s ease}' +
  '.ca-assist-footreset:hover{color:rgba(250,250,250,.88)}' +
  '.ca-assist-footreset__chev{opacity:.55;font-size:12px}' +
  '.ca-assist-footer-brand{display:flex;align-items:center;justify-content:flex-end;padding:0 14px 14px;min-width:0}' +
  '.ca-assist-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}' +
  '.ca-assist-region{border:0;padding:0;margin:0}' +
  '.ca-assist-shell.ca-assist-reduce-motion .ca-assist-launcher,.ca-assist-shell.ca-assist-reduce-motion .ca-assist-launcher:hover{transition:none !important;transform:none !important}' +
  '.ca-assist-shell.ca-assist-reduce-motion .ca-assist-close{transition:none !important}' +
  '.ca-assist-shell.ca-assist-reduce-motion .ca-assist-switch__track,.ca-assist-shell.ca-assist-reduce-motion .ca-assist-switch__thumb{transition:none !important}' +
  '.ca-assist-shell.ca-assist-reduce-motion .ca-assist-toggle,.ca-assist-shell.ca-assist-reduce-motion .ca-assist-navrow,.ca-assist-shell.ca-assist-reduce-motion .ca-assist-seg__btn,.ca-assist-shell.ca-assist-reduce-motion .ca-assist-profile-pill,.ca-assist-shell.ca-assist-reduce-motion .ca-assist-step__btn{transition:none !important}' +
  '.ca-assist-sec-group{display:flex;flex-direction:column;gap:0;border:1px solid rgba(255,255,255,.06);border-radius:14px;overflow:hidden;background:rgba(255,255,255,.02);margin-bottom:8px}' +
  '.ca-assist-sec-group-header{padding:8px 14px 4px;font-size:9px;font-weight:650;letter-spacing:.18em;text-transform:uppercase !important;color:rgba(212,212,216,.32);border-bottom:1px solid rgba(255,255,255,.04)}' +
  '.ca-assist-sec-group>.ca-assist-toggle{border-radius:0;border-bottom:1px solid rgba(255,255,255,.04)}' +
  '.ca-assist-sec-group>.ca-assist-toggle:last-child{border-bottom:0}' +
  '.ca-assist-panel--mono{background:linear-gradient(180deg,rgba(18,18,22,.99) 0%,rgba(10,10,14,1) 100%)}' +
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
    profiles:'Hebrew Profiles',
    profileBlind:'Hebrew Blind',
    profileLowVision:'Hebrew Low Vision',
    profileMotor:'Hebrew Motor',
    profileDyslexia:'Hebrew Dyslexia',
    profileADHD:'Hebrew ADHD',
    profileSeizure:'Hebrew Seizure Safe',
    profileClear:'Hebrew Clear Profile',
    textScale:'Hebrew Text Size',
    highContrast:'Hebrew High Contrast',
    contrastMode:'Hebrew Contrast Mode',
    contrastNone:'Hebrew None',
    contrastDark:'Hebrew Dark',
    contrastLight:'Hebrew Light',
    contrastInvert:'Hebrew Invert',
    contrastSmart:'Hebrew Smart',
    readableFont:'Hebrew Readable Font',
    pauseAnimations:'Hebrew Pause Animations',
    highlightLinks:'Hebrew Highlight Links',
    textSpacing:'Hebrew Text Spacing',
    spacingNormal:'Hebrew Normal',
    spacingModerate:'Hebrew Moderate',
    spacingHeavy:'Hebrew Heavy',
    lineHeight:'Hebrew Line Height',
    lineNormal:'Hebrew Normal',
    lineRelaxed:'Hebrew Relaxed',
    lineLoose:'Hebrew Loose',
    textAlign:'Hebrew Text Align',
    alignDefault:'Hebrew Default',
    alignLeft:'Hebrew Left',
    alignCenter:'Hebrew Center',
    alignJustify:'Hebrew Justify',
    saturation:'Hebrew Saturation',
    saturationNormal:'Hebrew Normal',
    saturationLow:'Hebrew Low',
    saturationHigh:'Hebrew High',
    saturationMono:'Hebrew Mono',
    hideImages:'Hebrew Hide Images',
    readingGuide:'Hebrew Reading Guide',
    readingMask:'Hebrew Reading Mask',
    bigCursor:'Hebrew Big Cursor',
    pageStructure:'Hebrew Page Structure',
    reset:'Hebrew Reset',
    statement:'Hebrew Accessibility Statement',
    reportIssue:'Hebrew Report Issue',
    language:'Hebrew Language',
    closePanel:'Hebrew Close accessibility settings',
    launcherAccessibilityMenu:'Hebrew accessibility menu',
    panelSubtitle:'Hebrew Accessibility preferences',
    panelHelper:'Hebrew Tune display, motion, and navigation for this site.',
    sectionReadingVision:'Hebrew Reading & vision',
    sectionMotion:'Hebrew Motion & display',
    sectionNavigation:'Hebrew Navigation',
    hintPauseAnimations:'Hebrew Pause non-essential animations'
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

function renderGlobalStyles(){
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
  if(state.language==='he'){root.setAttribute('dir','rtl');}
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
  var track=document.createElement('span');
  track.className='ca-assist-switch__track';
  var thumb=document.createElement('span');
  thumb.className='ca-assist-switch__thumb';
  track.appendChild(thumb);
  sw.appendChild(track);
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
  wrap.style.bottom=String(config.bottomOffset||18)+"px";
  wrap.style[config.position==="left"?"left":"right"]=String(config.sideOffset||18)+"px";
  wrap.style.setProperty('--ca-accent',String(config.brandColor||'#6d28d9'));
  wrap.style.setProperty('--ca-panel',String(config.panelColor||'#0b0c0f'));
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
  trigger.className='ca-assist-launcher';
  if(config.triggerStyle==='outline'){
    trigger.className+=' ca-assist-launcher--outline';
  }else if(config.triggerStyle==='glass'){
    trigger.className+=' ca-assist-launcher--glass';
  }else{
    trigger.className+=' ca-assist-launcher--solid';
  }
  trigger.style.borderRadius=String(Math.min(28,Math.max(14,Number(config.cornerRadius)||18)))+'px';
  trigger.style.minHeight=String(Math.max(44,Number(config.triggerSize)||52))+'px';
  var glyphSvg='<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.5"/><path d="M5.5 20.5c1.2-4 4.3-6 6.5-6s5.3 2 6.5 6"/></svg>';
  trigger.innerHTML='';
  var inner=document.createElement('span');
  inner.className='ca-assist-launcher__inner';
  if(config.showTextLabel){
    var brand=document.createElement('span');
    brand.className='ca-assist-launcher__brand';
    brand.appendChild(buildLauncherBrand());
    if(String(config.logoUrl||'').trim() && String(config.label||'').trim()){
      var cap=document.createElement('span');
      cap.className='ca-assist-launcher__caption';
      cap.textContent=String(config.label||'');
      brand.appendChild(cap);
    }
    var glyph=document.createElement('span');
    glyph.className='ca-assist-launcher__glyph';
    glyph.setAttribute('aria-hidden','true');
    glyph.innerHTML=glyphSvg;
    inner.appendChild(brand);
    inner.appendChild(glyph);
    trigger.appendChild(inner);
  }else{
    trigger.style.width=String(config.triggerSize||52)+'px';
    trigger.style.height=String(config.triggerSize||52)+'px';
    trigger.style.padding='8px';
    trigger.style.minWidth=String(config.triggerSize||52)+'px';
    if(String(config.logoUrl||'').trim()){
      var brand2=document.createElement('span');
      brand2.className='ca-assist-launcher__brand';
      brand2.style.justifyContent='center';
      brand2.appendChild(buildLauncherBrand());
      inner.appendChild(brand2);
    }else{
      var glyph2=document.createElement('span');
      glyph2.className='ca-assist-launcher__glyph';
      glyph2.setAttribute('aria-hidden','true');
      glyph2.innerHTML=glyphSvg;
      inner.appendChild(glyph2);
    }
    trigger.appendChild(inner);
  }

  var panel=document.createElement("div");
  var panelId="ca-assist-panel";
  panel.id=panelId;
  panel.className='ca-assist-panel';
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
      readBlock.className='ca-assist-block';
      readBlock.appendChild(makeSectionTitle(t('sectionReadingVision')));
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
      motionBlock.className='ca-assist-block';
      motionBlock.appendChild(makeSectionTitle(t('sectionMotion')));
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
      navBlock.className='ca-assist-block';
      navBlock.appendChild(makeSectionTitle(t('sectionNavigation')));
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
  trigger.addEventListener("click",function(){setOpen(panel.style.display==="none");});
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
