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
/* carbon-a11y-ui v3 studio | Phase A+B a11y (see docs/accessibility-widget-phase-a-b-spec.md)
 * Panel: non-modal named region (not aria-modal). No focus trap — Tab may move into page content.
 * Esc closes only while focus is inside the panel (keydown on panel). Space toggles switches; Arrow/Home/End in radiogroups.
 * Phase C motion: effectiveReducedMotion() + shouldMinimizeMotion() (pauseAnimations wins). Shell class carbon-a11y-reduce-motion gates widget CSS.
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
'.carbon-a11y-root,.carbon-a11y-root *{font-family:Inter,"Segoe UI",system-ui,-apple-system,sans-serif !important;letter-spacing:normal !important;text-transform:none !important;}' +
'.carbon-a11y-shell{position:relative;display:grid;}' +
'.carbon-a11y-trigger{display:inline-flex;align-items:center;gap:8px;border:0;color:#fff;padding:10px 14px;cursor:pointer;font-weight:650;font-size:15px;line-height:1;transition:transform .18s ease,box-shadow .18s ease,background .18s ease;}' +
'.carbon-a11y-trigger:hover{transform:translateY(-1px);}' +
'.carbon-a11y-trigger:focus-visible{outline:2px solid color-mix(in srgb,var(--carbon-brand,#8b5cf6) 70%,#fff);outline-offset:3px;}' +
'.carbon-a11y-trigger.carbon-solid{background:linear-gradient(145deg,color-mix(in srgb,var(--carbon-brand,#8b5cf6) 92%,#000),color-mix(in srgb,var(--carbon-brand,#8b5cf6) 55%,#1e1b4b));box-shadow:0 12px 32px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.12);}' +
'.carbon-a11y-trigger.carbon-outline{background:rgba(12,12,14,.72);border:1px solid color-mix(in srgb,var(--carbon-brand,#8b5cf6) 55%,rgba(255,255,255,.35));backdrop-filter:blur(12px);}' +
'.carbon-a11y-trigger.carbon-glass{background:linear-gradient(145deg,rgba(255,255,255,.16),rgba(255,255,255,.04));border:1px solid rgba(255,255,255,.22);backdrop-filter:blur(16px);}' +
'.carbon-a11y-panel{position:absolute;bottom:68px;max-width:calc(100vw - 24px);background:linear-gradient(180deg,#121214 0%,#0b0b0d 100%);color:#f4f4f5;border:1px solid rgba(255,255,255,.1);padding:0;border-radius:22px;box-shadow:0 28px 70px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.06);display:none;max-height:min(82vh,760px);overflow:auto;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.22) transparent;}' +
'.carbon-a11y-panel::-webkit-scrollbar{width:8px;height:8px;}' +
'.carbon-a11y-panel::-webkit-scrollbar-thumb{background:rgba(255,255,255,.18);border-radius:999px;}' +
'.carbon-a11y-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:18px 18px 14px;border-bottom:1px solid rgba(255,255,255,.08);background:radial-gradient(120% 80% at 0% 0%,color-mix(in srgb,var(--carbon-brand,#8b5cf6) 22%,transparent),transparent 55%);}' +
'.carbon-a11y-title{font-weight:720;font-size:17px;letter-spacing:-.02em !important;color:#fafafa;margin:0;line-height:1.2;}' +
'.carbon-a11y-sub{margin-top:4px;font-size:12px;font-weight:500;color:rgba(244,244,245,.55);line-height:1.35;}' +
'.carbon-a11y-close{border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#fafafa;border-radius:12px;width:36px;height:36px;font-size:20px;line-height:1;cursor:pointer;flex:0 0 auto;transition:background .15s ease,border-color .15s ease;}' +
'.carbon-a11y-close:hover{background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.22);}' +
'.carbon-a11y-panel-body{padding:12px 14px 18px;}' +
'.carbon-a11y-group{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:16px;overflow:hidden;margin-top:12px;}' +
'.carbon-a11y-group:first-of-type{margin-top:0;}' +
'.carbon-a11y-action{width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;text-align:left;border:0;border-bottom:1px solid rgba(255,255,255,.07);background:transparent;color:#f4f4f5;padding:13px 14px;min-height:48px;transition:background .14s ease;}' +
'.carbon-a11y-action:last-child{border-bottom:0;}' +
'.carbon-a11y-action:hover{background:rgba(255,255,255,.05);}' +
'.carbon-a11y-action-label{font-size:14px;font-weight:590;line-height:1.25;color:#f4f4f5;}' +
'.carbon-a11y-action-state{position:relative;display:inline-block;width:44px;height:26px;border-radius:999px;background:rgba(255,255,255,.14);font-size:0;flex:0 0 auto;transition:background .18s ease;}' +
'.carbon-a11y-action-state::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:999px;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.35);transition:transform .18s cubic-bezier(.2,.85,.25,1);}' +
'.carbon-a11y-action.is-on .carbon-a11y-action-state{background:color-mix(in srgb,var(--carbon-brand,#8b5cf6) 85%,#fff);}' +
'.carbon-a11y-action.is-on .carbon-a11y-action-state::after{transform:translateX(18px);}' +
'.carbon-a11y-cmd{width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;text-align:left;border:0;border-bottom:1px solid rgba(255,255,255,.07);background:transparent;color:#f4f4f5;padding:13px 14px;min-height:48px;cursor:pointer;transition:background .14s ease;}' +
'.carbon-a11y-cmd:last-child{border-bottom:0;}' +
'.carbon-a11y-cmd:hover{background:rgba(255,255,255,.05);}' +
'.carbon-a11y-cmd-label{font-size:14px;font-weight:590;line-height:1.25;color:#f4f4f5;}' +
'.carbon-a11y-cmd-badge{font-size:12px;font-weight:700;letter-spacing:.04em;color:rgba(244,244,245,.72);padding:4px 10px;border-radius:999px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.1);}' +
'.carbon-a11y-select-wrap{display:grid;grid-template-columns:1fr;gap:8px;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.07);}' +
'.carbon-a11y-select-wrap:last-child{border-bottom:0;}' +
'.carbon-a11y-label{font-size:11px;font-weight:700;color:rgba(244,244,245,.45);letter-spacing:.1em;text-transform:uppercase !important;}' +
'.carbon-a11y-select{width:100%;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.35);color:#fafafa;border-radius:12px;padding:10px 12px;font-size:14px;outline:none;appearance:none;background-image:linear-gradient(45deg,transparent 50%,rgba(255,255,255,.55) 50%),linear-gradient(135deg,rgba(255,255,255,.55) 50%,transparent 50%);background-position:calc(100% - 16px) calc(50% - 3px),calc(100% - 11px) calc(50% - 3px);background-size:5px 5px,5px 5px;background-repeat:no-repeat;}' +
'.carbon-a11y-select:focus{border-color:color-mix(in srgb,var(--carbon-brand,#8b5cf6) 65%,#fff);box-shadow:0 0 0 3px color-mix(in srgb,var(--carbon-brand,#8b5cf6) 28%,transparent);}' +
'.carbon-a11y-section{margin:16px 2px 8px;font-size:10px;letter-spacing:.14em !important;font-weight:800;color:rgba(244,244,245,.38);text-transform:uppercase !important;}' +
'.carbon-a11y-grid2{display:grid;grid-template-columns:1fr 1fr;gap:9px;}' +
'.carbon-a11y-tools-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;}' +
'.carbon-a11y-tool{border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05);color:#f4f4f5;border-radius:14px;padding:12px 8px;min-height:96px;display:grid;place-items:center;gap:6px;cursor:pointer;position:relative;transition:transform .14s ease, box-shadow .14s ease,background .14s ease;}' +
'.carbon-a11y-tool:hover{transform:translateY(-1px);box-shadow:0 10px 24px rgba(0,0,0,.35);background:rgba(255,255,255,.08);}' +
'.carbon-a11y-tool-icon{width:34px;height:34px;border-radius:999px;background:rgba(255,255,255,.1);color:#fafafa;display:grid;place-items:center;font-size:14px;font-weight:800;}' +
'.carbon-a11y-tool-label{font-size:13px;font-weight:650;line-height:1.2;text-align:center;color:#f4f4f5;}' +
'.carbon-a11y-tool-state{position:absolute;top:8px;right:8px;font-size:9px;padding:3px 7px;border-radius:999px;background:rgba(0,0,0,.35);color:#e4e4e7;font-weight:800;letter-spacing:.06em;text-transform:uppercase !important;border:1px solid rgba(255,255,255,.12);}' +
'.carbon-a11y-tool.is-on{background:color-mix(in srgb,var(--carbon-brand,#8b5cf6) 18%,rgba(255,255,255,.06));border-color:color-mix(in srgb,var(--carbon-brand,#8b5cf6) 45%,rgba(255,255,255,.2));}' +
'.carbon-a11y-tool.is-on .carbon-a11y-tool-state{background:color-mix(in srgb,var(--carbon-brand,#8b5cf6) 85%,#000);color:#fff;border-color:transparent;}' +
'.carbon-a11y-tool-state[data-kind="jump"]{background:rgba(59,130,246,.22);color:#dbeafe;border-color:rgba(59,130,246,.35);}' +
'.carbon-a11y-chip{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#f4f4f5;border-radius:12px;padding:10px 8px;font-size:13px;font-weight:620;transition:background .16s ease,border-color .16s ease;}' +
'.carbon-a11y-chip:hover{background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.18);}' +
'.carbon-a11y-reset{margin-top:14px;width:100%;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#fafafa;border-radius:14px;padding:12px 10px;font-size:14px;font-weight:680;cursor:pointer;transition:background .15s ease,border-color .15s ease;}' +
'.carbon-a11y-reset:hover{background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.22);}' +
'.carbon-a11y-link{display:inline-block;margin-top:10px;color:color-mix(in srgb,var(--carbon-brand,#8b5cf6) 78%,#fff);text-decoration:none;font-size:12px;font-weight:600;border-bottom:1px solid rgba(255,255,255,.18);padding-bottom:1px;}' +
'.carbon-a11y-link:hover{color:#fff;border-bottom-color:rgba(255,255,255,.45);}' +
'.carbon-a11y-link + .carbon-a11y-link{margin-top:8px;}' +
'.carbon-a11y-profile-strip{display:flex;gap:8px;overflow:auto;padding:2px 2px 6px;scrollbar-width:none;}' +
'.carbon-a11y-profile-strip::-webkit-scrollbar{display:none;}' +
'.carbon-a11y-profile-pill{white-space:nowrap;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);border-radius:999px;padding:8px 13px;font-size:12px;font-weight:650;color:#f4f4f5;cursor:pointer;transition:background .14s ease,border-color .14s ease;}' +
'.carbon-a11y-profile-pill:hover{background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.22);}' +
'.carbon-a11y-profile-clear{margin-top:10px;width:100%;border:1px dashed rgba(255,255,255,.22);background:transparent;border-radius:12px;padding:10px 12px;font-size:12px;font-weight:650;color:rgba(244,244,245,.75);cursor:pointer;}' +
'.carbon-a11y-profile-clear:hover{background:rgba(255,255,255,.05);color:#fff;}' +
'.carbon-a11y-list{display:grid;gap:0;margin-top:0;}' +
'.carbon-a11y-divider{height:1px;background:rgba(255,255,255,.08);margin:14px 0 4px;}' +
'.carbon-a11y-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;}' +
'.carbon-a11y-section-title{margin:0;font:inherit;}' +
'.carbon-a11y-rg-options{display:flex;flex-direction:column;gap:6px;margin-top:6px;}' +
'.carbon-a11y-radio{width:100%;display:flex;align-items:center;gap:10px;text-align:left;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.25);color:#f4f4f5;border-radius:12px;padding:10px 12px;font-size:14px;cursor:pointer;min-height:44px;}' +
'.carbon-a11y-radio[aria-checked="true"]{border-color:color-mix(in srgb,var(--carbon-brand,#8b5cf6) 55%,#fff);background:rgba(255,255,255,.08);}' +
'.carbon-a11y-radio:focus-visible{outline:2px solid color-mix(in srgb,var(--carbon-brand,#8b5cf6) 70%,#fff);outline-offset:2px;}' +
'.carbon-a11y-region{border:0;padding:0;margin:0;}' +
'.carbon-a11y-shell.carbon-a11y-reduce-motion .carbon-a11y-trigger{transition:none !important;}' +
'.carbon-a11y-shell.carbon-a11y-reduce-motion .carbon-a11y-trigger:hover{transform:none !important;}' +
'.carbon-a11y-shell.carbon-a11y-reduce-motion .carbon-a11y-close{transition:none !important;}' +
'.carbon-a11y-shell.carbon-a11y-reduce-motion .carbon-a11y-action-state,.carbon-a11y-shell.carbon-a11y-reduce-motion .carbon-a11y-action-state::after{transition:none !important;}' +
'.carbon-a11y-shell.carbon-a11y-reduce-motion .carbon-a11y-action,.carbon-a11y-shell.carbon-a11y-reduce-motion .carbon-a11y-cmd,.carbon-a11y-shell.carbon-a11y-reduce-motion .carbon-a11y-chip,.carbon-a11y-shell.carbon-a11y-reduce-motion .carbon-a11y-reset,.carbon-a11y-shell.carbon-a11y-reduce-motion .carbon-a11y-profile-pill{transition:none !important;}' +
'.carbon-a11y-shell.carbon-a11y-reduce-motion .carbon-a11y-tool{transition:none !important;}' +
'.carbon-a11y-shell.carbon-a11y-reduce-motion .carbon-a11y-tool:hover{transform:none !important;box-shadow:none !important;}' +
'.carbon-a11y-shell.carbon-a11y-reduce-motion .carbon-a11y-panel{transition:none !important;}';
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
    launcherAccessibilityMenu:'menu de accesibilidad'
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
    launcherAccessibilityMenu:'menu de acessibilidade'
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
    launcherAccessibilityMenu:'Hebrew accessibility menu'
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
    var sh=w&&w.shadowRoot&&w.shadowRoot.querySelector('.carbon-a11y-shell');
    if(!sh){return;}
    if(shouldMinimizeMotion()){
      sh.classList.add('carbon-a11y-reduce-motion');
    }else{
      sh.classList.remove('carbon-a11y-reduce-motion');
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

function makeAction(label,key,onToggle){
  var btn=document.createElement("button");
  btn.type="button";
  btn.className='carbon-a11y-action';
  btn.setAttribute('role','switch');
  btn.setAttribute('data-carbon-key','switch-'+String(key));
  var lid='carbon-a11y-lbl-'+String(key);
  var labelNode=document.createElement('span');
  labelNode.className='carbon-a11y-action-label';
  labelNode.id=lid;
  labelNode.textContent=label;
  btn.setAttribute('aria-labelledby',lid);
  var stateNode=document.createElement('span');
  stateNode.className='carbon-a11y-action-state';
  stateNode.setAttribute('aria-hidden','true');
  btn.appendChild(labelNode);
  btn.appendChild(stateNode);
  function paint(){
    var enabled=Boolean(state[key]);
    btn.setAttribute('aria-checked',enabled?'true':'false');
    if(enabled){btn.classList.add('is-on');}else{btn.classList.remove('is-on');}
  }
  paint();
  btn.addEventListener("click",function(){
    var prev=Boolean(state[key]);
    state[key]=!state[key];
    if(state[key]===prev){return;}
    paint();
    onToggle();
    saveState();
    track("toggle_"+String(key),{enabled:state[key]});
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
  btn.className='carbon-a11y-cmd';
  if(dataKey){btn.setAttribute('data-carbon-key',String(dataKey));}
  var labelNode=document.createElement('span');
  labelNode.className='carbon-a11y-cmd-label';
  labelNode.textContent=label;
  var badge=document.createElement('span');
  badge.className='carbon-a11y-cmd-badge';
  badge.textContent=String(badgeText||'');
  btn.appendChild(labelNode);
  btn.appendChild(badge);
  btn.addEventListener('click',function(){onClick();});
  return btn;
}

function makeRadioGroup(labelText,key,options,onToggle,annKey){
  var wrap=document.createElement('div');
  wrap.className='carbon-a11y-select-wrap';
  var lid='carbon-a11y-rg-lbl-'+String(key);
  var text=document.createElement('div');
  text.id=lid;
  text.className='carbon-a11y-label';
  text.textContent=labelText;
  var group=document.createElement('div');
  group.setAttribute('role','radiogroup');
  group.setAttribute('aria-labelledby',lid);
  var optsEl=document.createElement('div');
  optsEl.className='carbon-a11y-rg-options';
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
      b.className='carbon-a11y-radio';
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
  node.className='carbon-a11y-section carbon-a11y-section-title';
  return node;
}

function makeToolCard(opts){
  var card=document.createElement('button');
  card.type='button';
  card.className='carbon-a11y-tool';
  var icon=document.createElement('div');
  icon.className='carbon-a11y-tool-icon';
  icon.textContent=opts.icon;
  var label=document.createElement('div');
  label.className='carbon-a11y-tool-label';
  label.textContent=opts.label;
  var stateBadge=document.createElement('div');
  stateBadge.className='carbon-a11y-tool-state';
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
  card.className='carbon-a11y-tool';
  var icon=document.createElement('div');
  icon.className='carbon-a11y-tool-icon';
  icon.textContent=opts.icon;
  var label=document.createElement('div');
  label.className='carbon-a11y-tool-label';
  label.textContent=opts.label;
  var stateBadge=document.createElement('div');
  stateBadge.className='carbon-a11y-tool-state';
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

function createWidget(){
  var wrap=document.createElement("div");
  wrap.id="carbon-a11y-widget";
  wrap.style.position="fixed";
  wrap.style.zIndex="2147483000";
  wrap.style.bottom=String(config.bottomOffset||18)+"px";
  wrap.style[config.position==="left"?"left":"right"]=String(config.sideOffset||18)+"px";
  wrap.style.setProperty('--carbon-brand',String(config.brandColor||'#6d28d9'));
  var shadow=wrap.attachShadow({mode:'open'});
  var scopedStyle=document.createElement('style');
  scopedStyle.textContent=widgetCss;
  var shell=document.createElement('div');
  shell.className='carbon-a11y-root carbon-a11y-shell';
  shadow.appendChild(scopedStyle);
  shadow.appendChild(shell);
  var live=document.createElement('div');
  live.setAttribute('role','status');
  live.setAttribute('aria-live','polite');
  live.setAttribute('aria-atomic','true');
  live.className='carbon-a11y-sr-only';
  shell.appendChild(live);
  liveRegionRef=live;

  var trigger=document.createElement("button");
  trigger.type="button";
  trigger.setAttribute("aria-label",String(config.label||'Accessibility')+', '+t('launcherAccessibilityMenu'));
  trigger.setAttribute("aria-expanded","false");
  trigger.className='carbon-a11y-trigger';
  if(config.triggerStyle==='outline'){
    trigger.className+=' carbon-outline';
  }else if(config.triggerStyle==='glass'){
    trigger.className+=' carbon-glass';
  }else{
    trigger.className+=' carbon-solid';
  }
  trigger.style.borderRadius=String(config.cornerRadius)+"px";
  trigger.style.minHeight=String(config.triggerSize||52)+'px';
  var iconMarkup='<span aria-hidden="true" style="font-size:'+String(config.iconSize||20)+'px;line-height:1;">AA</span>';
  if(config.showTextLabel){
    trigger.innerHTML=iconMarkup+'<span>'+config.label+'</span>';
  }else{
    trigger.innerHTML=iconMarkup;
    trigger.style.width=String(config.triggerSize||52)+'px';
    trigger.style.height=String(config.triggerSize||52)+'px';
    trigger.style.padding='0';
    trigger.style.justifyContent='center';
  }

  var panel=document.createElement("div");
  var panelId="carbon-a11y-panel";
  panel.id=panelId;
  panel.className='carbon-a11y-panel';
  panel.style.display="none";
  panel.style[config.position==="left"?"left":"right"]="0";
  panel.style.width=String(Math.max(330, Number(config.panelWidth||340)))+"px";
  panel.style.borderRadius=String(config.cornerRadius)+"px";
  panel.setAttribute("role","region");
  trigger.setAttribute("aria-controls",panelId);

  var head=document.createElement('div');
  head.className='carbon-a11y-head';
  var headText=document.createElement('div');
  var title=document.createElement("div");
  title.id="carbon-a11y-panel-title";
  title.className='carbon-a11y-title';
  title.textContent=config.label;
  var sub=document.createElement('div');
  sub.id='carbon-a11y-panel-desc';
  sub.className='carbon-a11y-sub';
  sub.textContent='Tune display, motion, and navigation for this site.';
  headText.appendChild(title);
  headText.appendChild(sub);
  var closeBtn=document.createElement('button');
  closeBtn.type='button';
  closeBtn.id='carbon-a11y-close';
  closeBtn.className='carbon-a11y-close';
  closeBtn.setAttribute('data-carbon-key','close');
  closeBtn.setAttribute('aria-label',t('closePanel'));
  closeBtn.textContent='×';
  closeBtn.addEventListener('click',function(){setOpen(false);});
  head.appendChild(headText);
  head.appendChild(closeBtn);
  panel.setAttribute("aria-labelledby",title.id);
  panel.setAttribute("aria-describedby",sub.id);
  panel.appendChild(head);
  var panelBody=document.createElement('div');
  panelBody.className='carbon-a11y-panel-body';
  panel.appendChild(panelBody);
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

    if(config.features.languageSelector){
      var langGroup=document.createElement('div');
      langGroup.className='carbon-a11y-group';
      langGroup.appendChild(makeRadioGroup(t('language'),'language',[
        {value:'en',label:'English'},
        {value:'es',label:'Espanol'},
        {value:'pt-BR',label:'Portugues (Brasil)'},
        {value:'he',label:'Hebrew'}
      ],function(){saveState();rerenderPanel();renderGlobalStyles();track('language_change',{value:state.language});},'languageSet'));
      panelBody.appendChild(langGroup);
    }

    if(config.features.profiles){
      panelBody.appendChild(makeSectionTitle(t('profiles')));
      var profilesWrap=document.createElement('div');
      profilesWrap.className='carbon-a11y-profile-strip';
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
          b.className='carbon-a11y-profile-pill';
          b.setAttribute('data-carbon-key','profile-'+profile.key);
          b.textContent=profile.label;
          b.addEventListener('click',function(){applyProfile(profile.key);});
          profilesWrap.appendChild(b);
        })(profileDefs[p]);
      }
      panelBody.appendChild(profilesWrap);
      var clearProfile=document.createElement('button');
      clearProfile.type='button';
      clearProfile.className='carbon-a11y-profile-clear';
      clearProfile.setAttribute('data-carbon-key','profile-clear');
      clearProfile.textContent=t('profileClear');
      clearProfile.addEventListener('click',function(){applyProfile('clear');});
      panelBody.appendChild(clearProfile);
    }

    var quick=document.createElement('div');
    quick.className='carbon-a11y-list';

    if(config.features.highContrast){quick.appendChild(makeAction(t('highContrast'),'highContrast',renderGlobalStyles));}
    if(config.features.readableFont){quick.appendChild(makeAction(t('readableFont'),'readableFont',renderGlobalStyles));}
    if(config.features.pauseAnimations){quick.appendChild(makeAction(t('pauseAnimations'),'pauseAnimations',renderGlobalStyles));}
    if(config.features.highlightLinks){quick.appendChild(makeAction(t('highlightLinks'),'highlightLinks',renderGlobalStyles));}
    if(config.features.hideImages){quick.appendChild(makeAction(t('hideImages'),'hideImages',renderGlobalStyles));}
    if(config.features.readingGuide){quick.appendChild(makeAction(t('readingGuide'),'readingGuide',renderGlobalStyles));}
    if(config.features.readingMask){quick.appendChild(makeAction(t('readingMask'),'readingMask',renderGlobalStyles));}
    if(config.features.bigCursor){quick.appendChild(makeAction(t('bigCursor'),'bigCursor',renderGlobalStyles));}
    if(quick.children.length){
      panelBody.appendChild(makeSectionTitle('Quick controls'));
      var quickWrap=document.createElement('div');
      quickWrap.className='carbon-a11y-group';
      quickWrap.appendChild(quick);
      panelBody.appendChild(quickWrap);
    }

    var adjust=document.createElement('div');
    adjust.className='carbon-a11y-list';

    if(config.features.textScale){
      adjust.appendChild(makeCommandAction('Text larger',String(state.textScale)+'%',function(){
        if(state.textScale>=170){announce(ann('textSizeMax'));return;}
        state.textScale=Math.min(170,state.textScale+10);renderGlobalStyles();saveState();track('text_scale_change',{value:state.textScale});rerenderPanel();
        clearTimeout(scaleAnnounceTimer);
        scaleAnnounceTimer=setTimeout(function(){announce(annFmt('textSizePercent',state.textScale));},150);
      },'cmd-text-larger'));
      adjust.appendChild(makeCommandAction('Text smaller',String(state.textScale)+'%',function(){
        if(state.textScale<=85){announce(ann('textSizeMin'));return;}
        state.textScale=Math.max(85,state.textScale-10);renderGlobalStyles();saveState();track('text_scale_change',{value:state.textScale});rerenderPanel();
        clearTimeout(scaleAnnounceTimer);
        scaleAnnounceTimer=setTimeout(function(){announce(annFmt('textSizePercent',state.textScale));},150);
      },'cmd-text-smaller'));
    }
    if(config.features.contrastModes){adjust.appendChild(makeRadioGroup(t('contrastMode'),'contrastMode',[
      {value:'none',label:t('contrastNone')},
      {value:'dark',label:t('contrastDark')},
      {value:'light',label:t('contrastLight')},
      {value:'invert',label:t('contrastInvert')},
      {value:'smart',label:t('contrastSmart')}
    ],renderGlobalStyles,'contrastModeSet'));}
    if(config.features.textSpacing){adjust.appendChild(makeRadioGroup(t('textSpacing'),'textSpacing',[
      {value:'normal',label:t('spacingNormal')},
      {value:'moderate',label:t('spacingModerate')},
      {value:'heavy',label:t('spacingHeavy')}
    ],renderGlobalStyles,'textSpacingSet'));}
    if(config.features.lineHeight){adjust.appendChild(makeRadioGroup(t('lineHeight'),'lineHeight',[
      {value:'normal',label:t('lineNormal')},
      {value:'relaxed',label:t('lineRelaxed')},
      {value:'loose',label:t('lineLoose')}
    ],renderGlobalStyles,'lineHeightSet'));}
    if(config.features.textAlign){adjust.appendChild(makeRadioGroup(t('textAlign'),'textAlign',[
      {value:'default',label:t('alignDefault')},
      {value:'left',label:t('alignLeft')},
      {value:'center',label:t('alignCenter')},
      {value:'justify',label:t('alignJustify')}
    ],renderGlobalStyles,'textAlignSet'));}
    if(config.features.saturation){adjust.appendChild(makeRadioGroup(t('saturation'),'saturation',[
      {value:'normal',label:t('saturationNormal')},
      {value:'low',label:t('saturationLow')},
      {value:'high',label:t('saturationHigh')},
      {value:'mono',label:t('saturationMono')}
    ],renderGlobalStyles,'saturationSet'));}
    if(config.features.pageStructure){
      adjust.appendChild(makeCommandAction('Jump to headings','GO',function(){jumpToSelector('h1,h2,h3,h4,h5,h6',ann('jumpHeadingsOk'),ann('jumpHeadingsNone'));track('jump_headings',{});},'cmd-jump-headings'));
      adjust.appendChild(makeCommandAction('Jump to links','GO',function(){jumpToSelector('a[href]',ann('jumpLinksOk'),ann('jumpLinksNone'));track('jump_links',{});},'cmd-jump-links'));
    }
    if(adjust.children.length){
      panelBody.appendChild(makeSectionTitle('Adjustments'));
      var adjustWrap=document.createElement('div');
      adjustWrap.className='carbon-a11y-group';
      adjustWrap.appendChild(adjust);
      panelBody.appendChild(adjustWrap);
    }

    var divider=document.createElement('div');
    divider.className='carbon-a11y-divider';
    panelBody.appendChild(divider);

    var reset=document.createElement("button");
    reset.type="button";
    reset.className='carbon-a11y-reset';
    reset.setAttribute('data-carbon-key','reset-all');
    reset.textContent=t('reset');
    reset.addEventListener("click",function(){
      applyProfile('clear');
      track("reset",{});
    });
    panelBody.appendChild(reset);

    var statementHref=config.statementUrl || "";
    var feedbackHref=config.feedbackUrl || (config.supportEmail ? "mailto:"+config.supportEmail : "");
    if(statementHref){
      var statementLink=document.createElement("a");
      statementLink.className='carbon-a11y-link';
      statementLink.href=statementHref;
      statementLink.target="_blank";
      statementLink.rel="noopener noreferrer";
      statementLink.textContent=t('statement');
      panelBody.appendChild(statementLink);
    }
    if(feedbackHref){
      var feedbackLink=document.createElement("a");
      feedbackLink.className='carbon-a11y-link';
      feedbackLink.href=feedbackHref;
      feedbackLink.target=feedbackHref.indexOf("mailto:")===0?"_self":"_blank";
      feedbackLink.rel=feedbackHref.indexOf("mailto:")===0?"":"noopener noreferrer";
      feedbackLink.textContent=t('reportIssue');
      panelBody.appendChild(feedbackLink);
    }
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
    panel.style.display=isOpen?"block":"none";
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
