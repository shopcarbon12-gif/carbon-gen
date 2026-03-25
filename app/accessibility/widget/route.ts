import { readFileSync } from "fs";
import { join } from "path";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getConfiguredPublicAppOrigin, resolvePublicAppOrigin } from "@/lib/resolvePublicAppOrigin";

const WIDGET_ORIGIN_FALLBACK = "https://app.shopcarbon.com";

function trimTrailingSlash(s: string) {
  return s.replace(/\/+$/, "");
}

/** Never embed loopback origins in storefront widget (Coolify internal URL / mis-set NODE_ENV). */
function widgetPublicOrigin(req: NextRequest): string {
  const raw = trimTrailingSlash(resolvePublicAppOrigin(req));
  try {
    const { hostname } = new URL(raw);
    const h = hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (
      h === "0.0.0.0" ||
      h === "127.0.0.1" ||
      h === "localhost" ||
      h === "::1"
    ) {
      const cfg = trimTrailingSlash(getConfiguredPublicAppOrigin());
      return cfg || WIDGET_ORIGIN_FALLBACK;
    }
  } catch {
    const cfg = trimTrailingSlash(getConfiguredPublicAppOrigin());
    return cfg || WIDGET_ORIGIN_FALLBACK;
  }
  return raw;
}
import { normalizeAccessibilityLogoUrl } from "@/lib/accessibilityLogoUrl";
import { loadAccessibilityWidgetConfig } from "@/lib/accessibilityConfigRepository";

/** Inlined into widget JS so the default mark works under strict storefront CSP (no cross-origin img). */
let carbonHoneycombDataUrl = "";
try {
  const markBuf = readFileSync(join(process.cwd(), "public/accessibility-assets/carbon-honeycomb-mark.png"));
  carbonHoneycombDataUrl = `data:image/png;base64,${markBuf.toString("base64")}`;
} catch {
  carbonHoneycombDataUrl = "";
}

const DEFAULT_CONFIG = {
  brandColor: "#6d28d9",
  panelColor: "#111827",
  triggerStyle: "solid",
  position: "right",
  sideOffset: 10,
  bottomOffset: 10,
  triggerSize: 52,
  iconSize: 26,
  panelWidth: 400,
  cornerRadius: 22,
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
  panelTheme: "dark" as const,
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
    tooltips: true,
  },
};

/** Inlined so embeds always get this glyph (no img fetch/CORS/cache); matches public/accessibility-assets/widget-launcher-accessibility-icon.svg */
const WIDGET_LAUNCHER_GLYPH_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">' +
  '<circle cx="32" cy="32" r="31.5" fill="#000"/>' +
  '<circle cx="32" cy="32" r="28.5" fill="#fff"/>' +
  '<circle cx="32" cy="32" r="25.5" fill="#000"/>' +
  '<circle cx="31.53" cy="14.03" r="3.16" fill="#fff"/>' +
  '<path fill="#fff" transform="scale(0.0625)" d="M 621.0 774.5 L 610.0 772.5 L 603.0 768.5 L 594.5 756.0 L 523.0 547.5 L 497.0 547.5 L 495.5 549.0 L 470.5 632.0 L 428.5 762.0 L 420.0 770.5 L 409.0 774.5 L 396.0 771.5 L 385.5 762.0 L 381.5 750.0 L 382.5 743.0 L 432.5 544.0 L 441.5 513.0 L 441.5 363.0 L 393.0 354.5 L 302.0 342.5 L 284.0 338.5 L 275.5 332.0 L 269.5 318.0 L 271.5 308.0 L 279.0 298.5 L 286.0 294.5 L 300.0 293.5 L 384.0 302.5 L 473.0 309.5 L 546.0 309.5 L 657.0 300.5 L 721.0 293.5 L 734.0 293.5 L 743.0 297.5 L 749.5 304.0 L 753.5 313.0 L 752.5 324.0 L 748.0 331.5 L 738.0 338.5 L 718.0 342.5 L 613.0 356.5 L 577.5 363.0 L 577.5 514.0 L 643.5 746.0 L 643.5 754.0 L 639.5 763.0 L 633.0 769.5 L 621.0 774.5 Z"/>' +
  "</svg>";

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
        ? Math.max(48, Math.min(96, Math.round(cfg.triggerSize)))
        : DEFAULT_CONFIG.triggerSize,
    iconSize:
      typeof cfg.iconSize === "number" && Number.isFinite(cfg.iconSize)
        ? Math.max(14, Math.min(48, Math.round(cfg.iconSize)))
        : DEFAULT_CONFIG.iconSize,
    panelWidth:
      typeof cfg.panelWidth === "number" && Number.isFinite(cfg.panelWidth)
        ? Math.max(280, Math.min(520, Math.round(cfg.panelWidth)))
        : DEFAULT_CONFIG.panelWidth,
    cornerRadius:
      typeof cfg.cornerRadius === "number" && Number.isFinite(cfg.cornerRadius)
        ? Math.max(8, Math.min(28, Math.round(cfg.cornerRadius)))
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
        ? normalizeAccessibilityLogoUrl(cfg.logoUrl, "") || ""
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
    panelTheme: cfg.panelTheme === "light" ? ("light" as const) : ("dark" as const),
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
      tooltips: getFeature("tooltips", DEFAULT_CONFIG.features.tooltips),
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
  const widgetOrigin = widgetPublicOrigin(request as NextRequest);
  const usageEndpoint = `${widgetOrigin}/api/accessibility/usage`;
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
  const useLogoProxy = !configParam;
  /** Arrow used for the on-screen big-cursor overlay (theme cursor:url limits + !important cursors make overlay reliable). */
  const bigCursorDataUrl =
    "data:image/svg+xml," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">' +
        '<path d="M8 10v38l12-12 6 18 8-5-6-18h20L8 10z" fill="#ffffff" stroke="#0a0a0a" stroke-width="3" stroke-linejoin="round"/>' +
        "</svg>"
    );

  const js = `(function(){var __caRev=60;if(window.__carbonA11yRev===__caRev){return;}window.__carbonA11yRev=__caRev;window.__carbonA11yLoaded=true;
/* ca-assist-ui v3 studio | Phase A+B a11y (see docs/accessibility-widget-phase-a-b-spec.md)
 * Panel: non-modal named region (not aria-modal). No focus trap — Tab may move into page content.
 * Esc closes only while focus is inside the panel (keydown on panel). Space toggles switches; Arrow/Home/End in radiogroups.
 * Phase C motion: effectiveReducedMotion() + shouldMinimizeMotion() (pauseAnimations wins). Shell class ca-assist-reduce-motion gates widget CSS.
 * Config is JSON.parse-wrapped so embedded strings cannot break the script parser (e.g. </script>, U+2028).
 */
var config=JSON.parse(${JSON.stringify(configJson)});
var usageEndpoint=${JSON.stringify(usageEndpoint)};
var scope=${JSON.stringify(scope)};
var __caLogoProxy=${JSON.stringify(useLogoProxy)};
var __caBigCursorUrl=${JSON.stringify(bigCursorDataUrl)};
var __caWidgetOrigin=${JSON.stringify(widgetOrigin)};
var widgetPanelBg=(function(){try{return new URL("/accessibility-assets/widget-panel-bg-pic2.png",__caWidgetOrigin).href;}catch(_e){return String(__caWidgetOrigin||"").replace(/\\/$/,"")+"/accessibility-assets/widget-panel-bg-pic2.png";}})();
var carbonBrandMarkUrl=(function(){try{return new URL("/accessibility-assets/carbon-honeycomb-mark.png",__caWidgetOrigin).href;}catch(_e){return String(__caWidgetOrigin||"").replace(/\\/$/,"")+"/accessibility-assets/carbon-honeycomb-mark.png";}})();
var carbonBrandMarkInline=${JSON.stringify(carbonHoneycombDataUrl)};
function caDefaultCarbonMarkSrc(){
  try{
    if(typeof carbonBrandMarkInline==='string'&&carbonBrandMarkInline.indexOf('data:image')===0){return carbonBrandMarkInline;}
  }catch(_s){}
  return carbonBrandMarkUrl;
}
var launcherGlyphSvg=${JSON.stringify(WIDGET_LAUNCHER_GLYPH_SVG)};
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
  motionPreference:'system',
  plainLightUi:false,
  oversizedUi:false,
  enhancedTooltips:false
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
var __caVideoPauseBound=false;
var __caVideoObserver=null;
var __caCursorFollowEl=null;
function onVideoPlayWhilePaused(ev){
  try{
    if(!state.pauseAnimations)return;
    var t=ev.target;
    if(t&&t.tagName==='VIDEO'){t.pause();}
  }catch(_e){}
}
function __caPauseVideoEl(v){
  try{
    if(!v||v.tagName!=='VIDEO')return;
    v.pause();
    if(v.hasAttribute('autoplay')){
      v.setAttribute('data-ca-a11y-autoplay','1');
      v.removeAttribute('autoplay');
    }
  }catch(_pv){}
}
function __caScanAddedNodeForVideos(node){
  try{
    if(!node||node.nodeType!==1)return;
    if(node.tagName==='VIDEO'){__caPauseVideoEl(node);return;}
    if(node.querySelectorAll){
      var inner=node.querySelectorAll('video');
      for(var ii=0;ii<inner.length;ii++){__caPauseVideoEl(inner[ii]);}
    }
  }catch(_sn){}
}
function syncPauseAnimationsMedia(){
  try{
    if(state.pauseAnimations){
      var n=document.querySelectorAll('video');
      for(var i=0;i<n.length;i++){__caPauseVideoEl(n[i]);}
      if(!__caVideoPauseBound){
        document.addEventListener('play',onVideoPlayWhilePaused,true);
        __caVideoPauseBound=true;
      }
      if(!__caVideoObserver){
        __caVideoObserver=new MutationObserver(function(muts){
          if(!state.pauseAnimations)return;
          try{
            for(var mi=0;mi<muts.length;mi++){
              var m=muts[mi];
              for(var ni=0;ni<m.addedNodes.length;ni++){
                __caScanAddedNodeForVideos(m.addedNodes[ni]);
              }
            }
          }catch(_mo){}
        });
        __caVideoObserver.observe(document.documentElement,{childList:true,subtree:true});
      }
    }else{
      if(__caVideoPauseBound){
        document.removeEventListener('play',onVideoPlayWhilePaused,true);
        __caVideoPauseBound=false;
      }
      if(__caVideoObserver){
        __caVideoObserver.disconnect();
        __caVideoObserver=null;
      }
      var rest=document.querySelectorAll('video[data-ca-a11y-autoplay]');
      for(var k=0;k<rest.length;k++){
        try{
          rest[k].setAttribute('autoplay','');
          rest[k].removeAttribute('data-ca-a11y-autoplay');
        }catch(_rk){}
      }
    }
  }catch(_ve){}
}
function syncBigCursorOverlay(){
  try{
    if(!state.bigCursor){
      if(__caCursorMoveFn){
        document.removeEventListener('pointermove',__caCursorMoveFn,true);
        __caCursorMoveFn=null;
      }
      if(__caCursorFollowEl&&__caCursorFollowEl.parentNode){
        __caCursorFollowEl.parentNode.removeChild(__caCursorFollowEl);
      }
      __caCursorFollowEl=null;
      return;
    }
    var u=String(__caBigCursorUrl||'');
    if(!__caCursorFollowEl){
      __caCursorFollowEl=document.createElement('div');
      __caCursorFollowEl.id='carbon-a11y-cursor-follow';
      __caCursorFollowEl.setAttribute('aria-hidden','true');
      __caCursorFollowEl.style.cssText='position:fixed;left:0;top:0;width:56px;height:56px;margin:0;padding:0;pointer-events:none;z-index:2147483647;opacity:1;background-repeat:no-repeat;background-position:0 0;background-size:contain;border:none;transform:translate(-8px,-8px);will-change:left,top';
      __caCursorFollowEl.style.backgroundImage='url('+JSON.stringify(u)+')';
      var host=document.body||document.documentElement;
      host.appendChild(__caCursorFollowEl);
      __caCursorMoveFn=function(e){
        if(!__caCursorFollowEl||!state.bigCursor)return;
        try{
          var t=e.target;
          if(t&&t.closest&&(t.closest('input,textarea,select,option,[contenteditable="true"],[contenteditable="plaintext-only"]'))){__caCursorFollowEl.style.opacity='0';return;}
        }catch(_ct){}
        __caCursorFollowEl.style.opacity='1';
        __caCursorFollowEl.style.left=e.clientX+'px';
        __caCursorFollowEl.style.top=e.clientY+'px';
      };
      document.addEventListener('pointermove',__caCursorMoveFn,true);
    }
  }catch(_be){}
}
var widgetCss='' +
  '.ca-assist-root,.ca-assist-root::before,.ca-assist-root::after,.ca-assist-root *,.ca-assist-root *::before,.ca-assist-root *::after{box-sizing:border-box;margin:0;padding:0;font-family:ui-sans-serif,system-ui,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif !important;font-size:16px;line-height:1.5;letter-spacing:normal !important;text-decoration:none;color:inherit;border:none;background:transparent;box-shadow:none;outline:none;-webkit-font-smoothing:antialiased}' +
  '.ca-assist-root img{display:block;max-width:100%;height:auto;object-fit:contain}' +
  '.ca-assist-root button,.ca-assist-root [role="switch"],.ca-assist-root [role="radio"]{font:inherit;color:inherit;cursor:inherit;appearance:none;-webkit-appearance:none}' +
  '.ca-assist-root button.ca-assist-profile-pill{font-size:13px !important;font-weight:600 !important;line-height:1.3 !important}' +
  '.ca-assist-shell{position:relative;display:block;isolation:isolate;z-index:0;--ca-fab-size:52px}' +
  '.ca-assist-lang-he,.ca-assist-lang-he button,.ca-assist-lang-he .ca-assist-toggle__label,.ca-assist-lang-he .ca-assist-navrow__label,.ca-assist-lang-he .ca-assist-title{font-family:"Noto Sans Hebrew","Segoe UI","Arial Hebrew",Arial,sans-serif !important}' +
  '.ca-assist-launcher--fab{position:relative;z-index:30;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;width:var(--ca-launcher-size,52px);height:var(--ca-launcher-size,52px);min-width:0;max-width:none;padding:0;border-radius:50%;border:none;outline:none;background:transparent;box-shadow:none;backdrop-filter:none;-webkit-backdrop-filter:none;color:inherit;cursor:grab;touch-action:none;-webkit-tap-highlight-color:transparent;transition:transform .15s ease}' +
  '.ca-assist-launcher--fab::before,.ca-assist-launcher--fab::after{content:none !important;display:none !important;box-shadow:none !important;background:none !important}' +
  '.ca-assist-launcher--fab:hover{transform:translateY(-1px);filter:none}' +
  '.ca-assist-launcher--fab:active:not(.ca-assist-launcher--dragging){transform:translateY(0) scale(.98)}' +
  '.ca-assist-launcher--fab.ca-assist-launcher--dragging{cursor:grabbing;transform:scale(1.03);box-shadow:none}' +
  '.ca-assist-launcher--fab-outline,.ca-assist-launcher--fab-glass,.ca-assist-launcher--fab-solid{background:transparent !important;box-shadow:none !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important;border:none !important}' +
  '.ca-assist-launcher--fab:focus-visible{outline:2px solid color-mix(in srgb,var(--ca-accent,#7c3aed) 55%,#1e1b4b);outline-offset:2px}' +
  '.ca-assist-launcher--fab .ca-assist-launcher__glyph{display:flex;align-items:center;justify-content:center;width:100%;height:100%;min-width:0;min-height:0;margin:0;border:none;background:transparent;box-shadow:none;border-radius:0;overflow:visible;padding:0;color:inherit}' +
  '.ca-assist-launcher--fab .ca-assist-launcher__glyph svg{display:block;width:var(--ca-glyph-px,26px);height:var(--ca-glyph-px,26px);flex-shrink:0;box-sizing:border-box}' +
  '.ca-assist-markword{display:inline-flex;align-items:baseline;gap:0;letter-spacing:.14em !important;text-transform:uppercase !important;white-space:nowrap;font-size:10.5px;font-weight:600;color:#f4f4f5}' +
  '.ca-assist-markword--launcher{font-size:10px;letter-spacing:.16em !important}' +
  '.ca-assist-markword--strip{font-size:13px;letter-spacing:.14em !important}' +
  '.ca-assist-strip-default-logo{display:flex;align-items:center;justify-content:center;width:44px;height:44px;flex-shrink:0;border-radius:12px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);box-shadow:0 2px 12px rgba(0,0,0,.4)}' +
  '.ca-assist-strip-default-logo svg{display:block;width:78%;height:78%}' +
  '.ca-assist-markword--footer{font-size:8px;letter-spacing:.12em !important;opacity:.75}' +
  '.ca-assist-markword__carbon{font-weight:750;color:#fafafa}' +
  '.ca-assist-markword__assist{font-weight:520;color:rgba(228,228,231,.55)}' +
  '.ca-assist-brand{display:inline-flex;align-items:center;min-width:0;max-width:100%}' +
  '.ca-assist-logo-img{display:block;max-width:min(200px,55vw);height:auto;object-fit:contain;filter:drop-shadow(0 1px 2px rgba(0,0,0,.5))}' +
  '.ca-assist-wordmark{font-weight:750;font-size:10px;letter-spacing:.2em !important;color:#f4f4f5;text-transform:uppercase !important;white-space:nowrap}' +
  '.ca-assist-panel{position:fixed;z-index:1;top:auto;left:auto;right:auto;bottom:auto;max-width:min(520px,calc(100vw - 20px));width:100%;color:#e4e4e7;border:1px solid color-mix(in srgb,var(--ca-accent,#a78bfa) 38%,rgba(255,255,255,.1));padding:0;border-radius:22px;display:none;max-height:min(82vh,820px);overflow:hidden;flex-direction:column;background:linear-gradient(180deg,rgba(14,10,24,.48) 0%,rgba(18,12,30,.42) 45%,rgba(10,8,18,.52) 100%),linear-gradient(180deg,transparent 0%,transparent 58%,rgba(200,100,70,.06) 100%),linear-gradient(125deg,color-mix(in srgb,var(--ca-accent,#7c3aed) 18%,transparent) 0%,transparent 58%),radial-gradient(ellipse 95% 65% at 50% -5%,rgba(110,80,180,.12),transparent 55%),url(' + JSON.stringify(widgetPanelBg) + ') center center/cover no-repeat;background-color:#12121c;backdrop-filter:blur(22px) saturate(1.28);-webkit-backdrop-filter:blur(22px) saturate(1.28);box-shadow:0 32px 96px rgba(0,0,0,.82),0 0 0 1px rgba(255,255,255,.06) inset,0 0 72px color-mix(in srgb,var(--ca-accent,#7c3aed) 24%,transparent),0 1px 0 rgba(255,255,255,.1) inset,0 6px 36px color-mix(in srgb,var(--ca-accent,#8b5cf6) 32%,transparent)}' +
  '.ca-assist-panel,.ca-assist-shell .ca-assist-panel{display:flex;flex-direction:column;min-height:0;align-items:stretch}' +
  '.ca-assist-panel::before{content:"";pointer-events:none;position:absolute;inset:0;border-radius:inherit;z-index:0;opacity:.07;mix-blend-mode:overlay;background-image:url("data:image/svg+xml,%3Csvg xmlns%3D%22http://www.w3.org/2000/svg%22 viewBox%3D%220 0 256 256%22%3E%3Cfilter id%3D%22n%22%3E%3CfeTurbulence type%3D%22fractalNoise%22 baseFrequency%3D%220.85%22 numOctaves%3D%224%22 stitchTiles%3D%22stitch%22/%3E%3C/filter%3E%3Crect width%3D%22100%25%22 height%3D%22100%25%22 filter%3D%22url(%23n)%22 opacity%3D%220.65%22/%3E%3C/svg%3E");background-size:200px}' +
  '.ca-assist-panel::after{content:"";pointer-events:none;position:absolute;left:12%;right:12%;bottom:0;height:2px;border-radius:2px;z-index:0;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--ca-accent,#c4b5fd) 55%,#fff),transparent);opacity:.55;box-shadow:0 0 20px color-mix(in srgb,var(--ca-accent,#a78bfa) 50%,transparent)}' +
  '.ca-assist-panel > *{position:relative;z-index:1}' +
  '.ca-assist-panel::-webkit-scrollbar{width:6px}' +
  '.ca-assist-panel-body::-webkit-scrollbar{width:6px}' +
  '.ca-assist-panel-body::-webkit-scrollbar-thumb{background:rgba(255,255,255,.22);border-radius:999px}' +
  '.ca-assist-head{flex-shrink:0;border-bottom:1px solid rgba(255,255,255,.08);background:linear-gradient(180deg,rgba(255,255,255,.09) 0%,transparent 72%),radial-gradient(130% 120% at 0% 0%,color-mix(in srgb,var(--ca-accent,#a78bfa) 22%,transparent),transparent 52%)}' +
  '.ca-assist-brand-row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:20px 22px 16px;border-bottom:1px solid rgba(255,255,255,.06)}' +
  '.ca-assist-brand-actions{display:flex;align-items:center;gap:8px;flex-shrink:0}' +
  '.ca-assist-brand-left{display:flex;align-items:center;min-width:0;gap:14px}' +
  '.ca-assist-head-titles{padding:10px 22px 22px}' +
  '.ca-assist-eyebrow{font-size:10px;font-weight:650;letter-spacing:.16em !important;text-transform:uppercase !important;color:rgba(228,228,231,.72);margin-bottom:8px}' +
  '.ca-assist-title{font-weight:700;font-size:21px;letter-spacing:-.02em !important;color:#fafafa;margin:0;line-height:1.25}' +
  '.ca-assist-helper{margin-top:10px;font-size:14px;font-weight:450;color:rgba(212,212,216,.82);line-height:1.55;max-width:48ch}' +
  '.ca-assist-close{border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.35);color:#fafafa;border-radius:14px;width:38px;height:38px;font-size:20px;line-height:1;cursor:pointer;flex:0 0 auto;transition:background .15s ease,border-color .15s ease,box-shadow .15s ease}' +
  '.ca-assist-close:hover{background:rgba(255,255,255,.1);border-color:color-mix(in srgb,var(--ca-accent,#c4b5fd) 45%,rgba(255,255,255,.25));box-shadow:0 0 20px color-mix(in srgb,var(--ca-accent,#7c3aed) 35%,transparent)}' +
  '.ca-assist-close:focus-visible{outline:2px solid color-mix(in srgb,var(--ca-accent,#c4b5fd) 70%,#fff);outline-offset:2px}' +
  '.ca-assist-panel-body{flex:1 1 auto;min-height:0;max-height:100%;overflow-x:hidden;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior-y:contain;touch-action:pan-y;padding:22px 18px 26px;display:flex;flex-direction:column;gap:20px}' +
  '.ca-assist-block{display:flex;flex-direction:column;gap:8px}' +
  '.ca-assist-block > .ca-assist-sec{margin-bottom:0}' +
  '.ca-assist-stack{display:flex;flex-direction:column;gap:0;border:0;border-radius:0;background:transparent;overflow:visible}' +
  '.ca-assist-stack > .ca-assist-sec{margin:0 0 6px 2px;padding:0}' +
  '.ca-assist-strip-cluster{display:flex;align-items:center;gap:10px;min-width:0;flex:1}' +
  '.ca-assist-logo-img--strip{max-height:48px;width:auto!important}' +
  '.ca-assist-logo-img--carbon-default{flex-shrink:0;max-height:56px}' +
  '.ca-assist-logo-img--footer-mark{flex-shrink:0;max-height:28px;width:auto!important;object-fit:contain}' +
  '.ca-assist-footer-bar .ca-assist-brand{gap:10px;justify-content:flex-end;flex-shrink:0;margin:0}' +
  '.ca-assist-panel-sub{margin-top:6px;font-size:12.5px;font-weight:550;letter-spacing:.04em;color:rgba(228,228,231,.88);line-height:1.4}' +
  '.ca-assist-field--compact{padding:8px 0}' +
  '.ca-assist-field__name--compact{font-size:8.5px;font-weight:600;letter-spacing:.12em;margin-bottom:6px}' +
  '.ca-assist-seg--tight{gap:4px}' +
  '.ca-assist-field--compact .ca-assist-seg__btn{padding:5px 11px;border-radius:999px;min-height:30px;font-size:10.5px;font-weight:500;border-color:rgba(255,255,255,.08);background:rgba(0,0,0,.22)}' +
  '.ca-assist-field--compact .ca-assist-seg__btn:hover{background:rgba(255,255,255,.035)}' +
  '.ca-assist-field--compact .ca-assist-seg__btn[aria-checked="true"]{border-color:rgba(255,255,255,.16);background:rgba(255,255,255,.045);color:#f4f4f5;font-weight:520}' +
  '.ca-assist-sec{font-size:11px;font-weight:650;letter-spacing:.12em !important;text-transform:uppercase !important;color:rgba(228,228,231,.68);margin:0 0 12px 4px}' +
  '.ca-assist-field{padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.07)}' +
  '.ca-assist-field:last-child{border-bottom:0}' +
  '.ca-assist-field__name{font-size:12px;font-weight:650;letter-spacing:.1em;text-transform:uppercase !important;color:rgba(212,212,216,.72);margin-bottom:14px}' +
  '.ca-assist-field--textscale-row{display:flex !important;flex-direction:row !important;align-items:center !important;justify-content:space-between !important;gap:8px 12px !important;flex-wrap:nowrap !important;padding:8px 14px !important}' +
  '.ca-assist-field--textscale-row .ca-assist-field__name{margin-bottom:0 !important;flex:1 1 auto;min-width:0;font-size:10px !important;font-weight:650 !important;letter-spacing:.1em !important;line-height:1.2 !important}' +
  '.ca-assist-field--textscale-row .ca-assist-step{flex:0 0 auto;padding:0 !important;gap:6px !important;margin:0 !important}' +
  '.ca-assist-field--textscale-row .ca-assist-step__btn{width:30px !important;height:30px !important;border-radius:9px !important;font-size:15px !important;line-height:1 !important}' +
  '.ca-assist-field--textscale-row .ca-assist-step__val{min-width:42px !important;font-size:12px !important;font-weight:650 !important;padding:0 2px !important}' +
  '.ca-assist-seg{display:grid;grid-template-columns:repeat(auto-fit,minmax(48px,1fr));gap:4px;width:100%;align-items:stretch}' +
  '.ca-assist-field--compact .ca-assist-seg{display:flex;flex-wrap:wrap;gap:4px;width:auto}' +
  '.ca-assist-seg__btn{padding:10px 6px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.4);color:#f4f4f5;font-size:14px;font-weight:550;min-height:42px;width:100%;max-width:100%;box-sizing:border-box;cursor:inherit;text-align:center;line-height:1.2;white-space:normal;word-break:break-word;transition:background .15s ease,border-color .15s ease,color .15s ease,box-shadow .15s ease}' +
  '.ca-assist-seg__btn:hover{border-color:rgba(255,255,255,.22);background:rgba(255,255,255,.07)}' +
  '.ca-assist-seg__btn[aria-checked="true"]{border-color:color-mix(in srgb,var(--ca-accent,#c4b5fd) 50%,rgba(255,255,255,.2));background:linear-gradient(180deg,color-mix(in srgb,var(--ca-accent,#7c3aed) 35%,rgba(0,0,0,.2)),rgba(0,0,0,.35));color:#fff;font-weight:650;box-shadow:0 0 20px color-mix(in srgb,var(--ca-accent,#7c3aed) 28%,transparent),inset 0 1px 0 rgba(255,255,255,.12)}' +
  '.ca-assist-seg__btn:focus-visible{outline:1px solid color-mix(in srgb,var(--ca-accent,#a78bfa) 55%,#fff);outline-offset:2px}' +
  '.ca-assist-toggle{width:100%;display:flex;align-items:center;justify-content:space-between;gap:16px;text-align:left;border:0;border-bottom:1px solid rgba(255,255,255,.07);background:transparent;color:#e4e4e7;padding:14px 18px;min-height:52px;cursor:inherit;transition:background .12s ease;border-radius:0}' +
  '.ca-assist-toggle:last-child{border-bottom:0}' +
  '.ca-assist-toggle:hover{background:rgba(255,255,255,.04)}' +
  '.ca-assist-toggle:focus-visible{outline:2px solid color-mix(in srgb,var(--ca-accent,#c4b5fd) 65%,#fff);outline-offset:-2px}' +
  '.ca-assist-toggle__text{display:flex;flex-direction:column;gap:4px;align-items:flex-start;min-width:0;flex:1}' +
  '.ca-assist-toggle__label{font-size:15px;font-weight:600;line-height:1.35;color:#fafafa}' +
  '.ca-assist-toggle__hint{font-size:13px;font-weight:450;line-height:1.45;color:rgba(196,196,205,.92)}' +
  '.ca-assist-switch{flex:0 0 auto;display:flex;align-items:center;align-self:center}' +
  '.ca-assist-switch__track{position:relative;display:block;width:48px;height:28px;border-radius:999px;background:rgba(28,28,38,.95);border:1px solid rgba(255,255,255,.16);transition:background .2s ease,border-color .2s ease,box-shadow .2s ease;flex-shrink:0}' +
  '.ca-assist-toggle.is-on .ca-assist-switch__track{background:rgba(12,10,22,.55);border:2px solid color-mix(in srgb,var(--ca-accent,#a78bfa) 65%,rgba(255,255,255,.2));box-shadow:0 0 0 1px rgba(0,0,0,.4) inset,0 0 18px color-mix(in srgb,var(--ca-accent,#7c3aed) 45%,transparent)}' +
  '.ca-assist-switch__thumb{position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:999px;background:linear-gradient(180deg,#fff,#e4e4e7);box-shadow:0 2px 6px rgba(0,0,0,.5);transition:transform .2s cubic-bezier(.2,.85,.25,1)}' +
  '.ca-assist-toggle.is-on .ca-assist-switch__thumb{transform:translateX(22px)}' +
  '.ca-assist-quick-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;width:100%}' +
  '.ca-assist-quick-grid--one{grid-template-columns:1fr !important}' +
  '@media (max-width:380px){.ca-assist-quick-grid:not(.ca-assist-quick-grid--one){grid-template-columns:1fr}}' +
  '.ca-assist-tile{position:relative;display:flex;flex-direction:column;align-items:stretch;gap:8px;text-align:left;border:1px solid rgba(255,255,255,.12);border-radius:16px;background:rgba(0,0,0,.28);color:#e4e4e7;padding:12px 12px 10px;min-height:108px;cursor:inherit;transition:background .14s ease,border-color .14s ease,box-shadow .14s ease}' +
  '.ca-assist-tile:hover{background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.18)}' +
  '.ca-assist-tile.is-on{border-color:color-mix(in srgb,var(--ca-accent,#a78bfa) 42%,rgba(255,255,255,.2));background:linear-gradient(180deg,color-mix(in srgb,var(--ca-accent,#7c3aed) 22%,rgba(0,0,0,.35)),rgba(0,0,0,.32));box-shadow:0 0 24px color-mix(in srgb,var(--ca-accent,#7c3aed) 18%,transparent)}' +
  '.ca-assist-tile__glyph{align-self:flex-start;display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:12px;background:rgba(255,255,255,.08);font-size:16px;line-height:1;color:#fafafa}' +
  '.ca-assist-tile__text{display:flex;flex-direction:column;gap:4px;align-items:flex-start;min-width:0;flex:1}' +
  '.ca-assist-tile__label{font-size:13px;font-weight:650;line-height:1.25;color:#fafafa}' +
  '.ca-assist-tile__hint{font-size:11px;font-weight:450;line-height:1.3;color:rgba(196,196,205,.88)}' +
  '.ca-assist-tile__switch{align-self:flex-end;display:flex;align-items:center;margin-top:auto}' +
  '.ca-assist-tile__track{position:relative;display:block;width:40px;height:24px;border-radius:999px;background:rgba(28,28,38,.95);border:1px solid rgba(255,255,255,.14)}' +
  '.ca-assist-tile.is-on .ca-assist-tile__track{background:rgba(12,10,22,.55);border:2px solid color-mix(in srgb,var(--ca-accent,#a78bfa) 55%,rgba(255,255,255,.15));box-shadow:0 0 12px color-mix(in srgb,var(--ca-accent,#7c3aed) 35%,transparent)}' +
  '.ca-assist-tile__thumb{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:999px;background:linear-gradient(180deg,#fff,#e4e4e7);box-shadow:0 1px 4px rgba(0,0,0,.45);transition:transform .2s cubic-bezier(.2,.85,.25,1)}' +
  '.ca-assist-tile.is-on .ca-assist-tile__thumb{transform:translateX(16px)}' +
  '.ca-assist-tile:focus-visible{outline:2px solid color-mix(in srgb,var(--ca-accent,#c4b5fd) 65%,#fff);outline-offset:2px}' +
  '.ca-assist-shell--oversize .ca-assist-title{font-size:24px !important}' +
  '.ca-assist-shell--oversize .ca-assist-helper{font-size:15px !important}' +
  '.ca-assist-shell--oversize .ca-assist-panel-body{padding:26px 20px 28px !important;gap:22px !important}' +
  '.ca-assist-shell--oversize .ca-assist-toggle{padding:16px 18px !important;min-height:56px !important}' +
  '.ca-assist-shell--oversize .ca-assist-toggle__label{font-size:16px !important}' +
  '.ca-assist-shell--oversize .ca-assist-profile-pill{font-size:16px !important;padding:14px 20px !important;min-height:52px !important;line-height:1.35 !important}' +
  '.ca-assist-root.ca-assist-shell--oversize button.ca-assist-profile-pill{font-size:16px !important;font-weight:650 !important;padding:14px 20px !important;min-height:52px !important;line-height:1.35 !important}' +
  '.ca-assist-shell--oversize .ca-assist-tile{min-height:118px;padding:14px}' +
  '.ca-assist-shell--oversize .ca-assist-tile__label{font-size:14px}' +
  '.ca-assist-shell--oversize .ca-assist-tile__glyph{width:40px;height:40px;font-size:18px !important}' +
  '.ca-assist-shell--oversize .ca-assist-tile__hint{font-size:12px !important}' +
  '.ca-assist-shell--oversize .ca-assist-tile__track{width:44px;height:26px !important}' +
  '.ca-assist-shell--oversize .ca-assist-tile__thumb{width:20px;height:20px !important}' +
  '.ca-assist-shell--oversize .ca-assist-tile.is-on .ca-assist-tile__thumb{transform:translateX(20px) !important}' +
  '.ca-assist-shell--oversize .ca-assist-close{width:44px;height:44px;font-size:22px !important;border-radius:16px !important}' +
  '.ca-assist-shell--oversize .ca-assist-logo-img--strip{max-height:54px}' +
  '.ca-assist-shell--oversize .ca-assist-logo-img--carbon-default{max-height:60px}' +
  '.ca-assist-shell--oversize .ca-assist-logo-img--footer-mark{max-height:32px}' +
  '.ca-assist-shell--oversize .ca-assist-brand-row{padding:22px 22px 18px !important}' +
  '.ca-assist-shell--oversize .ca-assist-head-titles{padding:12px 22px 22px !important}' +
  '.ca-assist-shell--oversize .ca-assist-field__name{font-size:12px !important;margin-bottom:14px !important}' +
  '.ca-assist-shell--oversize .ca-assist-seg__btn,.ca-assist-root.ca-assist-shell--oversize button.ca-assist-seg__btn{padding:11px 8px !important;font-size:15px !important;font-weight:600 !important;min-height:46px !important;line-height:1.25 !important}' +
  '.ca-assist-shell--oversize .ca-assist-navrow{padding:16px 18px !important;min-height:56px !important}' +
  '.ca-assist-shell--oversize .ca-assist-navrow__label{font-size:16px !important}' +
  '.ca-assist-shell--oversize .ca-assist-navrow__val{font-size:12px !important}' +
  '.ca-assist-shell--oversize .ca-assist-navrow__chev{font-size:15px !important}' +
  '.ca-assist-shell--oversize .ca-assist-step__btn{width:44px;height:44px;font-size:22px !important}' +
  '.ca-assist-shell--oversize .ca-assist-step__val{font-size:14px !important;min-width:60px !important}' +
  '.ca-assist-shell--oversize .ca-assist-field--textscale-row{padding:9px 14px !important}' +
  '.ca-assist-shell--oversize .ca-assist-field--textscale-row .ca-assist-field__name{font-size:11px !important}' +
  '.ca-assist-shell--oversize .ca-assist-field--textscale-row .ca-assist-step{gap:8px !important}' +
  '.ca-assist-shell--oversize .ca-assist-field--textscale-row .ca-assist-step__btn{width:36px !important;height:36px !important;border-radius:10px !important;font-size:18px !important}' +
  '.ca-assist-shell--oversize .ca-assist-field--textscale-row .ca-assist-step__val{min-width:48px !important;font-size:13px !important}' +
  '.ca-assist-shell--oversize .ca-assist-toggle__hint{font-size:14px !important}' +
  '.ca-assist-shell--oversize .ca-assist-switch__track{width:52px;height:30px !important}' +
  '.ca-assist-shell--oversize .ca-assist-switch__thumb{width:22px;height:22px !important;top:2px !important;left:2px !important}' +
  '.ca-assist-shell--oversize .ca-assist-toggle.is-on .ca-assist-switch__thumb{transform:translateX(24px) !important}' +
  '.ca-assist-shell--oversize .ca-assist-footer-dynamic{padding:16px 18px 14px !important}' +
  '.ca-assist-shell--oversize .ca-assist-footreset{font-size:13px !important}' +
  '.ca-assist-shell--oversize .ca-assist-footer-globe{width:40px;height:40px !important}' +
  '.ca-assist-shell--oversize .ca-assist-profile-clear{font-size:12.5px !important;padding:11px 14px !important;font-weight:600 !important}' +
  '.ca-assist-shell--oversize .ca-assist-profile-strip{gap:9px !important;row-gap:12px !important}' +
  '.ca-assist-shell--oversize .ca-assist-markword--strip{font-size:14px !important;letter-spacing:.12em !important}' +
  '.ca-assist-shell--oversize .ca-assist-markword--strip .ca-assist-markword__carbon,.ca-assist-shell--oversize .ca-assist-markword--strip .ca-assist-markword__assist{font-size:inherit !important}' +
  '.ca-assist-shell--oversize .ca-assist-quick-grid{gap:12px !important}' +
  '.ca-assist-shell--oversize .ca-assist-sec-group{margin-bottom:14px !important;border-radius:20px !important}' +
  '.ca-assist-shell--oversize .ca-assist-sec-group-body{padding:8px 16px 16px !important}' +
  '.ca-assist-shell--oversize .ca-assist-sec-group--commands .ca-assist-navrow{padding:16px 18px !important}' +
  '.ca-assist-shell--oversize .ca-assist-field--compact{padding:12px 0 !important}' +
  '.ca-assist-shell--oversize .ca-assist-field--compact .ca-assist-field__name--compact{font-size:12px !important;font-weight:650 !important;letter-spacing:.12em !important;margin-bottom:10px !important}' +
  '.ca-assist-shell--oversize .ca-assist-field--compact .ca-assist-seg--tight{gap:8px !important;row-gap:10px !important}' +
  '.ca-assist-shell--oversize .ca-assist-field--compact .ca-assist-seg__btn,.ca-assist-root.ca-assist-shell--oversize .ca-assist-field--compact button.ca-assist-seg__btn{padding:14px 20px !important;min-height:52px !important;font-size:16px !important;font-weight:600 !important;line-height:1.25 !important}' +
  '.ca-assist-shell--oversize .ca-assist-sec-group-header{font-size:13.5px !important;padding:16px 18px 14px !important;letter-spacing:.11em !important}' +
  '.ca-assist-shell--oversize .ca-assist-sec-group--panel-chrome .ca-assist-sec-group-header{padding:9px 14px 7px !important}' +
  '.ca-assist-shell--oversize .ca-assist-sec-group--panel-chrome .ca-assist-sec-group-body{padding:2px 12px 8px !important}' +
  '.ca-assist-shell--oversize .ca-assist-sec-group--panel-chrome .ca-assist-toggle{padding:9px 14px !important;min-height:48px !important;gap:12px !important}' +
  '.ca-assist-shell--oversize .ca-assist-footlink{font-size:14.5px !important}' +
  '.ca-assist-shell--oversize .ca-assist-footreset .ca-assist-footreset__label{font-size:14px !important}' +
  '.ca-assist-shell.ca-assist-reduce-motion .ca-assist-tile__thumb{transition:none !important}' +
  '.ca-assist-navrow{width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;text-align:left;border:0;border-bottom:1px solid rgba(255,255,255,.07);background:transparent;color:#e4e4e7;padding:14px 18px;min-height:52px;cursor:inherit;transition:background .12s ease;border-radius:0}' +
  '.ca-assist-navrow:last-child{border-bottom:0}' +
  '.ca-assist-navrow:hover{background:rgba(255,255,255,.06)}' +
  '.ca-assist-navrow:focus-visible{outline:2px solid color-mix(in srgb,var(--ca-accent,#c4b5fd) 65%,#fff);outline-offset:-2px;z-index:1;position:relative}' +
  '.ca-assist-navrow__label{font-size:15px;font-weight:550;color:#f4f4f5;min-width:0}' +
  '.ca-assist-navrow__right{display:flex;align-items:center;gap:6px;flex-shrink:0;padding-left:10px}' +
  '.ca-assist-navrow__val{font-size:11px;font-weight:700;letter-spacing:.06em;color:rgba(228,228,231,.72);white-space:nowrap}' +
  '.ca-assist-navrow__chev{font-size:14px;color:rgba(212,212,216,.45);font-weight:300;min-width:1ch}' +
  '.ca-assist-step{display:flex;align-items:center;justify-content:center;gap:10px;padding:4px 0 2px}' +
  '.ca-assist-step__btn{width:40px;height:40px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.4);color:#fafafa;font-size:20px;line-height:1;cursor:pointer;transition:background .15s ease,border-color .15s ease}' +
  '.ca-assist-step__btn:hover{border-color:rgba(255,255,255,.2);background:rgba(255,255,255,.06)}' +
  '.ca-assist-step__val{min-width:56px;text-align:center;font-size:13px;font-weight:650;letter-spacing:.02em;color:#fafafa}' +
  '.ca-assist-profile-strip{display:flex;flex-wrap:wrap;gap:7px;row-gap:10px;align-items:flex-start;justify-content:flex-start;overflow:visible;padding:4px 2px 10px;min-width:0}' +
  '.ca-assist-profile-pill{flex:0 1 auto;white-space:nowrap;border:1px solid rgba(255,255,255,.14);background:linear-gradient(180deg,rgba(255,255,255,.1),rgba(0,0,0,.25));border-radius:999px;padding:12px 18px;font-size:14px;font-weight:600;color:#f4f4f5;min-height:48px;cursor:inherit;transition:background .14s ease,border-color .14s ease,transform .14s ease,box-shadow .14s ease}' +
  '.ca-assist-profile-pill:hover{border-color:rgba(255,255,255,.22);background:rgba(255,255,255,.1);box-shadow:0 4px 20px rgba(0,0,0,.35)}' +
  '.ca-assist-profile-pill:active{transform:scale(.98)}' +
  '.ca-assist-profile-clear{margin-top:4px;width:100%;border:1px dashed rgba(255,255,255,.16);background:transparent;border-radius:11px;padding:9px 11px;font-size:10.5px;font-weight:550;color:rgba(212,212,216,.55);cursor:pointer}' +
  '.ca-assist-profile-clear:hover{background:rgba(255,255,255,.04);color:rgba(250,250,250,.85)}' +
  '.ca-assist-footer{flex-shrink:0;display:flex;flex-direction:column;gap:0;border-top:1px solid rgba(255,255,255,.08);background:linear-gradient(180deg,transparent,rgba(0,0,0,.35)),linear-gradient(180deg,transparent 40%,color-mix(in srgb,var(--ca-accent,#7c3aed) 8%,transparent) 100%)}' +
  '.ca-assist-footer-dynamic{display:flex;flex-direction:column;gap:10px;padding:14px 16px 12px}' +
  '.ca-assist-footer-lang{display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap}' +
  '.ca-assist-footer-lang .ca-assist-field{flex:1;min-width:180px;border:0;padding:0;background:transparent}' +
  '.ca-assist-footer-lang .ca-assist-field__name{display:none}' +
  '.ca-assist-footer-lang .ca-assist-seg{display:grid;grid-template-columns:repeat(auto-fit,minmax(48px,1fr));gap:4px;width:100%}' +
  '.ca-assist-footer-globe{flex:0 0 auto;display:grid;place-items:center;width:36px;height:36px;margin-top:2px;border-radius:999px;border:1px solid color-mix(in srgb,var(--ca-accent,#a78bfa) 28%,rgba(255,255,255,.1));background:rgba(0,0,0,.35);color:color-mix(in srgb,var(--ca-accent,#c4b5fd) 45%,rgba(212,212,216,.55))}' +
  '.ca-assist-footer-links-row{display:flex;flex-wrap:wrap;align-items:center;gap:4px 14px;padding:8px 0 6px;width:100%}' +
  '.ca-assist-footer-links-sep{opacity:.5;font-weight:300;color:rgba(228,228,231,.5)}' +
  '.ca-assist-footer-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0 6px;margin-top:2px;border-top:1px solid rgba(255,255,255,.08);width:100%;min-width:0}' +
  '.ca-assist-footlink{font-size:13px;font-weight:550;color:#e9d5ff;text-decoration:none;border-bottom:1px solid color-mix(in srgb,var(--ca-accent,#a78bfa) 45%,rgba(255,255,255,.2));padding-bottom:2px;letter-spacing:.01em;white-space:nowrap}' +
  '.ca-assist-footlink:hover{color:#fff;border-bottom-color:rgba(255,255,255,.28)}' +
  '.ca-assist-footreset{align-self:flex-start;display:inline-flex;align-items:center;gap:8px;border:0;background:transparent;color:rgba(228,228,231,.85);font-size:11.5px;font-weight:650;letter-spacing:.08em;text-transform:uppercase !important;cursor:pointer;padding:6px 0;min-height:44px;transition:color .15s ease}' +
  '.ca-assist-footreset:hover{color:#fff}' +
  '.ca-assist-footreset__chev{opacity:.55;font-size:12px}' +
  '.ca-assist-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}' +
  '.ca-assist-region{border:0;padding:0;margin:0}' +
  '.ca-assist-shell.ca-assist-reduce-motion .ca-assist-launcher--fab,.ca-assist-shell.ca-assist-reduce-motion .ca-assist-launcher--fab:hover{transition:none !important;transform:none !important;filter:none !important}' +
  '.ca-assist-shell.ca-assist-reduce-motion .ca-assist-close{transition:none !important}' +
  '.ca-assist-shell.ca-assist-reduce-motion .ca-assist-switch__track,.ca-assist-shell.ca-assist-reduce-motion .ca-assist-switch__thumb{transition:none !important}' +
  '.ca-assist-shell.ca-assist-reduce-motion .ca-assist-toggle,.ca-assist-shell.ca-assist-reduce-motion .ca-assist-navrow,.ca-assist-shell.ca-assist-reduce-motion .ca-assist-seg__btn,.ca-assist-shell.ca-assist-reduce-motion .ca-assist-profile-pill,.ca-assist-shell.ca-assist-reduce-motion .ca-assist-step__btn,.ca-assist-shell.ca-assist-reduce-motion .ca-assist-tile{transition:none !important}' +
  '.ca-assist-sec-group{display:flex;flex-direction:column;gap:0;border:1px solid rgba(255,255,255,.11);border-radius:18px;overflow:visible;background:linear-gradient(180deg,rgba(76,54,118,.26) 0%,rgba(14,10,26,.38) 100%);margin-bottom:12px;backdrop-filter:blur(14px) saturate(1.12);-webkit-backdrop-filter:blur(14px) saturate(1.12);box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 10px 36px rgba(0,0,0,.4),0 1px 0 0 rgba(255,255,255,.06)}' +
  '.ca-assist-sec-group-header{padding:12px 18px 10px;font-size:11px;font-weight:650;letter-spacing:.12em;text-transform:uppercase !important;color:rgba(228,228,231,.75);border-bottom:1px solid rgba(255,255,255,.08)}' +
  '.ca-assist-sec-group--commands .ca-assist-sec-group-body{padding:0 0 2px;overflow:hidden;border-radius:0 0 16px 16px}' +
  '.ca-assist-sec-group--commands .ca-assist-navrow{padding:14px 18px}' +
  '.ca-assist-sec-group .ca-assist-toggle{border-radius:0;border-bottom:1px solid rgba(255,255,255,.04)}' +
  '.ca-assist-sec-group .ca-assist-toggle:last-child{border-bottom:0}' +
  '.ca-assist-sec-group-body{padding:6px 14px 14px;display:flex;flex-direction:column;gap:0;min-height:0}' +
  '.ca-assist-sec-group-body > .ca-assist-profile-strip{padding-top:4px}' +
  '.ca-assist-sec-group-body > .ca-assist-stack{gap:0}' +
  '.ca-assist-sec-group--panel-chrome{margin-bottom:8px !important;border-radius:14px !important}' +
  '.ca-assist-sec-group--panel-chrome .ca-assist-sec-group-header{padding:7px 14px 5px !important}' +
  '.ca-assist-sec-group--panel-chrome .ca-assist-sec-group-body{padding:0 10px 6px !important}' +
  '.ca-assist-sec-group--panel-chrome .ca-assist-toggle{padding:7px 12px !important;min-height:44px !important;gap:10px !important}' +
  '.ca-assist-sec-group--panel-chrome .ca-assist-toggle__text{gap:2px !important}' +
  '.ca-assist-panel--mono{background:linear-gradient(180deg,rgba(12,8,22,.5) 0%,rgba(16,10,28,.44) 50%,rgba(8,6,16,.55) 100%),linear-gradient(180deg,transparent 60%,rgba(255,255,255,.02) 100%),linear-gradient(125deg,color-mix(in srgb,var(--ca-accent,#7c3aed) 18%,transparent) 0%,transparent 55%),radial-gradient(ellipse 100% 70% at 50% 0%,rgba(100,70,170,.1),transparent 52%),url(' + JSON.stringify(widgetPanelBg) + ') center center/cover no-repeat;background-color:#12121c;backdrop-filter:blur(22px) saturate(1.25);-webkit-backdrop-filter:blur(22px) saturate(1.25)}' +
  '.ca-assist-panel--light{color:#18181b !important;border:1px solid #e5e7eb !important;background:#f8fafc linear-gradient(180deg,rgba(255,255,255,.94) 0%,#f1f5f9 100%) !important;background-color:#f8fafc !important;box-shadow:0 24px 64px rgba(15,23,42,.12),0 0 0 1px rgba(255,255,255,.9) inset !important;backdrop-filter:blur(18px) saturate(1.15) !important;-webkit-backdrop-filter:blur(18px) saturate(1.15) !important}' +
  '.ca-assist-panel--light::before{opacity:.04 !important}' +
  '.ca-assist-panel--light::after{opacity:.35 !important;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--ca-accent,#6366f1) 40%,#e2e8f0),transparent) !important}' +
  '.ca-assist-panel--light .ca-assist-head{border-bottom:1px solid #e5e7eb !important;background:linear-gradient(180deg,rgba(255,255,255,.85) 0%,transparent 100%) !important}' +
  '.ca-assist-panel--light .ca-assist-brand-row{border-bottom:1px solid #e2e8f0 !important}' +
  '.ca-assist-panel--light .ca-assist-title{color:#0f172a !important}' +
  '.ca-assist-panel--light .ca-assist-helper{color:#475569 !important}' +
  '.ca-assist-panel--light .ca-assist-close{border:1px solid #cbd5e1 !important;background:#fff !important;color:#0f172a !important}' +
  '.ca-assist-panel--light .ca-assist-close:hover{background:#f1f5f9 !important;border-color:color-mix(in srgb,var(--ca-accent,#6366f1) 35%,#cbd5e1) !important;box-shadow:0 4px 16px rgba(15,23,42,.08) !important}' +
  '.ca-assist-panel--light .ca-assist-panel-body::-webkit-scrollbar-thumb{background:rgba(15,23,42,.15) !important}' +
  '.ca-assist-panel--light .ca-assist-field{border-bottom:1px solid #e2e8f0 !important}' +
  '.ca-assist-panel--light .ca-assist-field__name{color:#64748b !important}' +
  '.ca-assist-panel--light .ca-assist-seg__btn{border:1px solid #cbd5e1 !important;background:#fff !important;color:#0f172a !important}' +
  '.ca-assist-panel--light .ca-assist-seg__btn:hover{background:#f8fafc !important;border-color:#94a3b8 !important}' +
  '.ca-assist-panel--light .ca-assist-seg__btn[aria-checked="true"]{border-color:color-mix(in srgb,var(--ca-accent,#6366f1) 55%,#cbd5e1) !important;background:linear-gradient(180deg,color-mix(in srgb,var(--ca-accent,#6366f1) 12%,#fff),#f1f5f9) !important;color:#0f172a !important;box-shadow:0 2px 12px color-mix(in srgb,var(--ca-accent,#6366f1) 15%,transparent) !important}' +
  '.ca-assist-panel--light .ca-assist-toggle{border-bottom:1px solid #e2e8f0 !important;color:#1e293b !important}' +
  '.ca-assist-panel--light .ca-assist-toggle:hover{background:rgba(15,23,42,.04) !important}' +
  '.ca-assist-panel--light .ca-assist-toggle__label{color:#0f172a !important}' +
  '.ca-assist-panel--light .ca-assist-toggle__hint{color:#64748b !important}' +
  '.ca-assist-panel--light .ca-assist-switch__track{background:#e2e8f0 !important;border:1px solid #cbd5e1 !important}' +
  '.ca-assist-panel--light .ca-assist-toggle.is-on .ca-assist-switch__track{background:#fff !important;border:2px solid color-mix(in srgb,var(--ca-accent,#6366f1) 50%,#94a3b8) !important}' +
  '.ca-assist-panel--light .ca-assist-tile{border:1px solid #e2e8f0 !important;background:#fff !important;color:#1e293b !important}' +
  '.ca-assist-panel--light .ca-assist-tile:hover{background:#f8fafc !important;border-color:#cbd5e1 !important}' +
  '.ca-assist-panel--light .ca-assist-tile.is-on{border-color:color-mix(in srgb,var(--ca-accent,#6366f1) 45%,#cbd5e1) !important;background:linear-gradient(180deg,color-mix(in srgb,var(--ca-accent,#6366f1) 8%,#fff),#f1f5f9) !important;box-shadow:0 4px 20px color-mix(in srgb,var(--ca-accent,#6366f1) 12%,transparent) !important}' +
  '.ca-assist-panel--light .ca-assist-tile__glyph{background:#f1f5f9 !important;color:#0f172a !important;border:1px solid #e2e8f0 !important}' +
  '.ca-assist-panel--light .ca-assist-tile__label{color:#0f172a !important}' +
  '.ca-assist-panel--light .ca-assist-tile__hint{color:#64748b !important}' +
  '.ca-assist-panel--light .ca-assist-tile__track{background:#e2e8f0 !important;border:1px solid #cbd5e1 !important}' +
  '.ca-assist-panel--light .ca-assist-tile.is-on .ca-assist-tile__track{background:#fff !important}' +
  '.ca-assist-panel--light .ca-assist-navrow{border-bottom:1px solid #e2e8f0 !important;color:#1e293b !important}' +
  '.ca-assist-panel--light .ca-assist-navrow:hover{background:rgba(15,23,42,.04) !important}' +
  '.ca-assist-panel--light .ca-assist-navrow__label{color:#0f172a !important}' +
  '.ca-assist-panel--light .ca-assist-navrow__val{color:#64748b !important}' +
  '.ca-assist-panel--light .ca-assist-step__btn{border:1px solid #cbd5e1 !important;background:#fff !important;color:#0f172a !important}' +
  '.ca-assist-panel--light .ca-assist-step__val{color:#0f172a !important}' +
  '.ca-assist-panel--light .ca-assist-profile-pill{border:1px solid #cbd5e1 !important;background:#fff !important;color:#0f172a !important}' +
  '.ca-assist-panel--light .ca-assist-profile-pill:hover{background:#f8fafc !important}' +
  '.ca-assist-panel--light .ca-assist-profile-clear{border:1px dashed #cbd5e1 !important;color:#64748b !important}' +
  '.ca-assist-panel--light .ca-assist-footer{border-top:1px solid #e5e7eb !important;background:linear-gradient(180deg,transparent,#f1f5f9) !important}' +
  '.ca-assist-panel--light .ca-assist-footer-globe{border:1px solid #e2e8f0 !important;background:#fff !important;color:color-mix(in srgb,var(--ca-accent,#6366f1) 55%,#475569) !important}' +
  '.ca-assist-panel--light .ca-assist-footlink{color:color-mix(in srgb,var(--ca-accent,#4f46e5) 70%,#1e40af) !important;border-bottom-color:#cbd5e1 !important}' +
  '.ca-assist-panel--light .ca-assist-footer-bar{border-top-color:#e2e8f0 !important}' +
  '.ca-assist-panel--light .ca-assist-footreset{color:#475569 !important}' +
  '.ca-assist-panel--light .ca-assist-sec-group{border:1px solid #e2e8f0 !important;background:linear-gradient(180deg,#fff 0%,#f8fafc 100%) !important;box-shadow:inset 0 1px 0 rgba(255,255,255,.9),0 8px 24px rgba(15,23,42,.06) !important}' +
  '.ca-assist-panel--light .ca-assist-sec-group-header{color:#64748b !important;border-bottom:1px solid #e2e8f0 !important}' +
  '.ca-assist-panel--light .ca-assist-markword{color:#475569 !important}' +
  '.ca-assist-panel--light .ca-assist-markword__carbon{color:#0f172a !important}' +
  '.ca-assist-panel--light .ca-assist-markword__assist{color:#64748b !important}' +
  '.ca-assist-panel--light .ca-assist-strip-default-logo{background:#f1f5f9 !important;border:1px solid #e2e8f0 !important}' +
  '.ca-assist-panel--light .ca-assist-wordmark{color:#0f172a !important}' +
  '.ca-assist-panel--light.ca-assist-panel--edge{box-shadow:0 -12px 40px rgba(15,23,42,.1),0 0 24px color-mix(in srgb,var(--ca-accent,#6366f1) 8%,transparent) !important;border:1px solid #e5e7eb !important;border-bottom:none !important}' +
  '.ca-assist-panel--edge{height:auto !important;border-radius:22px 22px 0 0 !important;box-sizing:border-box !important;box-shadow:0 -12px 48px rgba(0,0,0,.65),0 0 40px color-mix(in srgb,var(--ca-accent,#7c3aed) 18%,transparent) !important;border:1px solid rgba(255,255,255,.12) !important;border-bottom:none !important}' +
  '.ca-assist-panel.ca-assist-panel--plain{color:#111 !important;border:1px solid #d4d4d8 !important;background:#fff !important;background-image:none !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important;box-shadow:0 8px 28px rgba(0,0,0,.08) !important}' +
  '.ca-assist-panel.ca-assist-panel--plain::before,.ca-assist-panel.ca-assist-panel--plain::after{display:none !important}' +
  '.ca-assist-panel.ca-assist-panel--plain.ca-assist-panel--edge{box-shadow:0 -6px 24px rgba(0,0,0,.08) !important;border:1px solid #d4d4d8 !important;border-bottom:none !important}' +
  '.ca-assist-panel.ca-assist-panel--plain .ca-assist-head{border-bottom:1px solid #e5e5e5 !important;background:#fff !important}' +
  '.ca-assist-panel.ca-assist-panel--plain .ca-assist-brand-row{border-bottom:1px solid #e5e5e5 !important;background:#fff !important}' +
  '.ca-assist-panel.ca-assist-panel--plain .ca-assist-title,.ca-assist-panel.ca-assist-panel--plain .ca-assist-panel-body{color:#111 !important}' +
  '.ca-assist-panel.ca-assist-panel--plain .ca-assist-helper{color:#444 !important}' +
  '.ca-assist-panel.ca-assist-panel--plain .ca-assist-close{border:1px solid #ccc !important;background:#fff !important;color:#111 !important;box-shadow:none !important}' +
  '.ca-assist-panel.ca-assist-panel--plain .ca-assist-close:hover{background:#f5f5f5 !important;border-color:#999 !important}' +
  '.ca-assist-panel.ca-assist-panel--plain .ca-assist-panel-body::-webkit-scrollbar-thumb{background:rgba(0,0,0,.2) !important}' +
  '.ca-assist-panel.ca-assist-panel--plain .ca-assist-field{border-bottom:1px solid #eee !important}' +
  '.ca-assist-panel.ca-assist-panel--plain .ca-assist-field__name{color:#555 !important}' +
  '.ca-assist-panel.ca-assist-panel--plain .ca-assist-seg__btn{border:1px solid #ccc !important;background:#fff !important;color:#111 !important;box-shadow:none !important}' +
  '.ca-assist-panel.ca-assist-panel--plain .ca-assist-seg__btn:hover{background:#f5f5f5 !important;border-color:#999 !important}' +
  '.ca-assist-panel.ca-assist-panel--plain .ca-assist-seg__btn[aria-checked="true"]{border-color:#6366f1 !important;background:#eef2ff !important;color:#111 !important;box-shadow:none !important}' +
  '.ca-assist-panel.ca-assist-panel--plain .ca-assist-toggle{border-bottom:1px solid #eee !important;color:#111 !important}' +
  '.ca-assist-panel.ca-assist-panel--plain .ca-assist-toggle:hover{background:#f7f7f7 !important}' +
  '.ca-assist-panel.ca-assist-panel--plain .ca-assist-toggle__label{color:#111 !important}' +
  '.ca-assist-panel.ca-assist-panel--plain .ca-assist-toggle__hint{color:#555 !important}' +
  '.ca-assist-panel.ca-assist-panel--plain .ca-assist-switch__track{background:#e8e8e8 !important;border:1px solid #bbb !important}' +
  '.ca-assist-panel.ca-assist-panel--plain .ca-assist-toggle.is-on .ca-assist-switch__track{background:#e0e7ff !important;border:2px solid #4f46e5 !important}' +
  '.ca-assist-panel.ca-assist-panel--plain .ca-assist-tile{border:1px solid #ddd !important;background:#fff !important;color:#111 !important;box-shadow:none !important}' +
  '.ca-assist-panel.ca-assist-panel--plain .ca-assist-tile:hover{background:#f7f7f7 !important}' +
  '.ca-assist-panel.ca-assist-panel--plain .ca-assist-tile.is-on{border-color:#4f46e5 !important;background:#eef2ff !important;box-shadow:none !important}' +
  '.ca-assist-panel.ca-assist-panel--plain .ca-assist-tile__glyph{background:#f0f0f0 !important;color:#111 !important;border:1px solid #ccc !important}' +
  '.ca-assist-panel.ca-assist-panel--plain .ca-assist-tile__label{color:#111 !important}' +
  '.ca-assist-panel.ca-assist-panel--plain .ca-assist-tile__hint{color:#555 !important}' +
  '.ca-assist-panel.ca-assist-panel--plain .ca-assist-tile__track{background:#e8e8e8 !important;border:1px solid #bbb !important}' +
  '.ca-assist-panel.ca-assist-panel--plain .ca-assist-tile.is-on .ca-assist-tile__track{background:#e0e7ff !important}' +
  '.ca-assist-panel.ca-assist-panel--plain .ca-assist-navrow{border-bottom:1px solid #eee !important;color:#111 !important}' +
  '.ca-assist-panel.ca-assist-panel--plain .ca-assist-navrow:hover{background:#f7f7f7 !important}' +
  '.ca-assist-panel.ca-assist-panel--plain .ca-assist-navrow__label{color:#111 !important}' +
  '.ca-assist-panel.ca-assist-panel--plain .ca-assist-navrow__val{color:#555 !important}' +
  '.ca-assist-panel.ca-assist-panel--plain .ca-assist-step__btn{border:1px solid #ccc !important;background:#fff !important;color:#111 !important}' +
  '.ca-assist-panel.ca-assist-panel--plain .ca-assist-step__val{color:#111 !important}' +
  '.ca-assist-panel.ca-assist-panel--plain .ca-assist-profile-pill{border:1px solid #ccc !important;background:#fff !important;color:#111 !important;box-shadow:none !important}' +
  '.ca-assist-panel.ca-assist-panel--plain .ca-assist-profile-pill:hover{background:#f5f5f5 !important}' +
  '.ca-assist-panel.ca-assist-panel--plain .ca-assist-profile-clear{border:1px dashed #bbb !important;color:#666 !important;background:transparent !important}' +
  '.ca-assist-panel.ca-assist-panel--plain .ca-assist-footer{border-top:1px solid #e5e5e5 !important;background:#fff !important;box-shadow:none !important}' +
  '.ca-assist-panel.ca-assist-panel--plain .ca-assist-footer-globe{border:1px solid #ccc !important;background:#fff !important;color:#444 !important}' +
  '.ca-assist-panel.ca-assist-panel--plain .ca-assist-footlink{color:#1d4ed8 !important;border-bottom-color:#93c5fd !important}' +
  '.ca-assist-panel.ca-assist-panel--plain .ca-assist-footer-bar{border-top-color:#e5e5e5 !important}' +
  '.ca-assist-panel.ca-assist-panel--plain .ca-assist-footreset{color:#444 !important}' +
  '.ca-assist-panel.ca-assist-panel--plain .ca-assist-sec-group{border:1px solid #e0e0e0 !important;background:#fafafa !important;box-shadow:none !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important}' +
  '.ca-assist-panel.ca-assist-panel--plain .ca-assist-sec-group-header{color:#444 !important;border-bottom:1px solid #e5e5e5 !important}' +
  '.ca-assist-panel.ca-assist-panel--plain .ca-assist-markword,.ca-assist-panel.ca-assist-panel--plain .ca-assist-markword__assist{color:#555 !important}' +
  '.ca-assist-panel.ca-assist-panel--plain .ca-assist-markword__carbon,.ca-assist-panel.ca-assist-panel--plain .ca-assist-wordmark{color:#111 !important}' +
  '.ca-assist-panel.ca-assist-panel--plain .ca-assist-strip-default-logo{background:#f0f0f0 !important;border:1px solid #ccc !important}' +
  '';
var guideLine=document.createElement('div');
guideLine.id='carbon-a11y-guide-line';
guideLine.style.position='fixed';
guideLine.style.left='0';
guideLine.style.right='0';
guideLine.style.height='2px';
guideLine.style.background='rgba(253, 224, 71, 0.95)';
guideLine.style.zIndex='2147483647';
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
readingMask.style.zIndex='2147483645';
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
    jumpToHeadings:'Jump to headings',
    jumpToLinks:'Jump to links',
    navGo:'GO',
    reset:'Reset',
    statement:'Accessibility statement',
    reportIssue:'Report an accessibility issue',
    language:'Language',
    closePanel:'Close accessibility settings',
    launcherAccessibilityMenu:'accessibility menu',
    panelSubtitle:'Accessibility preferences',
    panelHelper:'Tune display, motion, and navigation for this site.',
    plainLightUi:'Plain light panel',
    plainLightUiHelp:'Simple white background and high-contrast text for the menu',
    oversizedUi:'Larger menu & controls',
    oversizedUiHelp:'Larger launcher button, wider panel, bigger type and touch targets',
    enhancedTooltips:'Visible tooltips',
    enhancedTooltipsHelp:'Show larger hints for native title text across this page',
    sectionReadingVision:'Reading & vision',
    sectionMotion:'Motion & display',
    sectionNavigation:'Navigation',
    sectionPanelChrome:'Panel appearance',
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
      plainLightUiOn:'Plain light panel on',
      plainLightUiOff:'Plain light panel off',
      oversizedUiOn:'Larger menu layout on',
      oversizedUiOff:'Larger menu layout off',
      enhancedTooltipsOn:'Visible tooltips on',
      enhancedTooltipsOff:'Visible tooltips off',
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
    jumpToHeadings:'Ir a encabezados',
    jumpToLinks:'Ir a enlaces',
    navGo:'IR',
    reset:'Restablecer',
    statement:'Declaracion de accesibilidad',
    reportIssue:'Reportar problema',
    language:'Idioma',
    closePanel:'Cerrar panel de accesibilidad',
    launcherAccessibilityMenu:'menu de accesibilidad',
    panelSubtitle:'Preferencias de accesibilidad',
    panelHelper:'Ajusta visualizacion, movimiento y navegacion en este sitio.',
    plainLightUi:'Panel claro simple',
    plainLightUiHelp:'Fondo blanco y texto de alto contraste para el menu',
    oversizedUi:'Menu y controles mas grandes',
    oversizedUiHelp:'Boton lanzador mas grande, panel mas ancho, texto y controles mas grandes',
    enhancedTooltips:'Informacion emergente visible',
    enhancedTooltipsHelp:'Muestra sugerencias mas grandes para el texto title nativo en esta pagina',
    sectionReadingVision:'Lectura y vision',
    sectionMotion:'Movimiento y pantalla',
    sectionNavigation:'Navegacion',
    sectionPanelChrome:'Apariencia del panel',
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
    jumpToHeadings:'Ir para titulos',
    jumpToLinks:'Ir para links',
    navGo:'IR',
    reset:'Redefinir',
    statement:'Declaracao de acessibilidade',
    reportIssue:'Reportar problema',
    language:'Idioma',
    closePanel:'Fechar painel de acessibilidade',
    launcherAccessibilityMenu:'menu de acessibilidade',
    panelSubtitle:'Preferencias de acessibilidade',
    panelHelper:'Ajuste exibicao, movimento e navegacao neste site.',
    plainLightUi:'Painel claro simples',
    plainLightUiHelp:'Fundo branco e texto de alto contraste no menu',
    oversizedUi:'Menu e controles maiores',
    oversizedUiHelp:'Botao lancador maior, painel mais largo, texto e controles maiores',
    enhancedTooltips:'Dicas visiveis',
    enhancedTooltipsHelp:'Mostra dicas maiores para o texto title nativo nesta pagina',
    sectionReadingVision:'Leitura e visao',
    sectionMotion:'Movimento e tela',
    sectionNavigation:'Navegacao',
    sectionPanelChrome:'Aparência do painel',
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
    jumpToHeadings:'קפיצה לכותרות',
    jumpToLinks:'קפיצה לקישורים',
    navGo:'עבור',
    reset:'איפוס',
    statement:'הצהרת נגישות',
    reportIssue:'דיווח על נגישות',
    language:'שפה',
    closePanel:'סגירת לוח נגישות',
    launcherAccessibilityMenu:'תפריט נגישות',
    panelSubtitle:'העדפות נגישות',
    panelHelper:'כוונון תצוגה, תנועה וניווט באתר זה.',
    plainLightUi:'פאנל בהיר פשוט',
    plainLightUiHelp:'רקע לבן וטקסט ברור לתפריט',
    oversizedUi:'תפריט ופקדים גדולים יותר',
    oversizedUiHelp:'כפתור משגר גדול יותר, פאנל רחב יותר, טקסט ופקדים גדולים יותר',
    enhancedTooltips:'הסברים גלויים',
    enhancedTooltipsHelp:'הצגת רמזים גדולים יותר לטקסט title ברחבי העמוד',
    sectionReadingVision:'קריאה וראייה',
    sectionMotion:'תנועה ותצוגה',
    sectionNavigation:'ניווט',
    sectionPanelChrome:'מראה הפאנל',
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
      plainLightUiOn:'פאנל בהיר פשוט מופעל',
      plainLightUiOff:'פאנל בהיר פשוט כבוי',
      oversizedUiOn:'תצוגת תפריט מוגדלת',
      oversizedUiOff:'תצוגת תפריט רגילה',
      enhancedTooltipsOn:'הסברי כלים מופעלים',
      enhancedTooltipsOff:'הסברי כלים כבויים',
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
      motionPreference:state.motionPreference,
      plainLightUi:state.plainLightUi,
      oversizedUi:state.oversizedUi,
      enhancedTooltips:state.enhancedTooltips
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
    if(typeof state.plainLightUi!=='boolean'){state.plainLightUi=false;}
    if(typeof state.oversizedUi!=='boolean'){state.oversizedUi=false;}
    if(typeof state.enhancedTooltips!=='boolean'){state.enhancedTooltips=false;}
    try{
      if(!config.features||config.features.tooltips===false){state.enhancedTooltips=false;}
    }catch(_ft){}
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
function stripLogoBaseMaxPx(){
  var mh=Number(config.logoMaxHeight);
  if(!isFinite(mh)||mh<12){mh=32;}
  return Math.min(mh,120);
}
function stripLogoAppliedMaxPx(){
  var base=stripLogoBaseMaxPx();
  return state.oversizedUi?Math.min(Math.round(base*1.125),120):base;
}
function footerLogoBasePx(){
  var fmh=Number(config.logoMaxHeight);
  if(!isFinite(fmh)||fmh<12){fmh=18;}
  return Math.min(fmh,22);
}
function footerLogoAppliedMaxPx(){
  var base=footerLogoBasePx();
  return state.oversizedUi?Math.min(Math.round(base*1.125),32):base;
}
function applyBrandLogoMaxHeights(){
  var stripPx=stripLogoAppliedMaxPx()+'px';
  var footPx=footerLogoAppliedMaxPx()+'px';
  try{
    var w=document.getElementById('carbon-a11y-widget');
    var sr=w&&w.shadowRoot;
    if(!sr){return;}
    var simg=sr.querySelectorAll('img.ca-assist-logo-img--strip');
    for(var si=0;si<simg.length;si++){
      simg[si].style.maxHeight=stripPx;
    }
    var fimg=sr.querySelectorAll('img.ca-assist-logo-img--footer-mark');
    for(var fi=0;fi<fimg.length;fi++){
      fimg[fi].style.maxHeight=footPx;
    }
  }catch(_e){}
}
function syncOversizedShellClass(){
  try{
    var w=document.getElementById('carbon-a11y-widget');
    var sh=w&&w.shadowRoot&&w.shadowRoot.querySelector('.ca-assist-shell');
    if(!sh){return;}
    if(state.oversizedUi){
      sh.classList.add('ca-assist-shell--oversize');
    }else{
      sh.classList.remove('ca-assist-shell--oversize');
    }
    applyBrandLogoMaxHeights();
  }catch(_e2){}
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

function syncAssistShellLangDir(){
  try{
    var w=document.getElementById('carbon-a11y-widget');
    var sh=w&&w.shadowRoot&&w.shadowRoot.querySelector('.ca-assist-shell');
    if(!sh){return;}
    var lang='en';
    if(state.language==='es'){lang='es';}
    else if(state.language==='pt-BR'){lang='pt-BR';}
    else if(state.language==='he'){lang='he';}
    sh.setAttribute('lang',lang);
    sh.setAttribute('dir',state.language==='he'?'rtl':'ltr');
  }catch(_e){}
}

function syncShadowBigCursorStyle(){
  try{
    var host=document.getElementById('carbon-a11y-widget');
    var sr=host&&host.shadowRoot;
    if(!sr){return;}
    var st=sr.getElementById('ca-a11y-cursor-sync');
    if(!st){
      st=document.createElement('style');
      st.id='ca-a11y-cursor-sync';
      sr.appendChild(st);
    }
    if(state.bigCursor){
      var u=String(__caBigCursorUrl||'').split('"').join('');
      st.textContent='.ca-assist-shell .ca-assist-launcher--fab,.ca-assist-shell button,.ca-assist-shell [role=switch],.ca-assist-shell [role=radio],.ca-assist-shell a,.ca-assist-shell .ca-assist-navrow,.ca-assist-shell .ca-assist-toggle,.ca-assist-shell .ca-assist-tile{cursor:url("'+u+'") 4 4, crosshair, auto !important;}';
    }else{
      st.textContent='';
    }
  }catch(_e){}
}

function syncPanelThemeClass(){
  try{
    var w=document.getElementById('carbon-a11y-widget');
    var p=w&&w.shadowRoot&&w.shadowRoot.getElementById('ca-assist-panel');
    if(!p){return;}
    if(config.panelTheme==='light'){
      p.classList.add('ca-assist-panel--light');
    }else{
      p.classList.remove('ca-assist-panel--light');
    }
  }catch(_e){}
}

function syncPlainPanelClass(){
  try{
    var w=document.getElementById('carbon-a11y-widget');
    var p=w&&w.shadowRoot&&w.shadowRoot.getElementById('ca-assist-panel');
    if(!p){return;}
    if(state.plainLightUi){
      p.classList.add('ca-assist-panel--plain');
    }else{
      p.classList.remove('ca-assist-panel--plain');
    }
  }catch(_e){}
}

var pageTooltipEl=null;
var pageTooltipOwner=null;
var pageTooltipBound=false;
var pageTooltipFocus=false;
var tooltipTitleObserver=null;

function tooltipFeatureActive(){
  try{return Boolean(config&&config.features&&config.features.tooltips);}catch(_e){return false;}
}

function nodeInsideA11yChrome(el){
  if(!el||el.nodeType!==1){return true;}
  try{
    if(el.id==='carbon-a11y-widget'||(el.closest&&el.closest('#carbon-a11y-widget'))){return true;}
    if(el.id==='carbon-a11y-page-tooltip'){return true;}
    if(el.id==='carbon-a11y-style'){return true;}
    if(el.id==='carbon-a11y-guide-line'){return true;}
    if(el.id==='carbon-a11y-reading-mask'){return true;}
  }catch(_e){}
  return false;
}

function tooltipEventTargetElement(ev){
  try{
    var t=ev&&ev.target;
    if(!t){return null;}
    if(t.nodeType===1){return t;}
    if(t.nodeType===3&&t.parentElement){return t.parentElement;}
  }catch(_e){}
  return null;
}
function findTooltipSource(start){
  var el=start;
  while(el&&el.nodeType===1){
    if(nodeInsideA11yChrome(el)){return null;}
    var dt=el.getAttribute('data-carbon-orig-title');
    var tt=el.getAttribute('title');
    var raw=(dt!=null&&String(dt).trim())?String(dt).trim():((tt!=null&&String(tt).trim())?String(tt).trim():'');
    if(raw){return {el:el,text:raw};}
    el=el.parentElement;
  }
  return null;
}

function getPageTooltipEl(){
  if(pageTooltipEl){return pageTooltipEl;}
  pageTooltipEl=document.createElement('div');
  pageTooltipEl.id='carbon-a11y-page-tooltip';
  pageTooltipEl.setAttribute('role','tooltip');
  pageTooltipEl.setAttribute('aria-hidden','true');
  pageTooltipEl.style.cssText='display:none;position:fixed;z-index:2147483646;left:0;top:0;max-width:min(320px,calc(100vw - 24px));padding:10px 14px;border-radius:10px;background:rgba(248,250,252,.98);color:#18181b;border:1px solid #e2e8f0;box-shadow:0 12px 40px rgba(15,23,42,.18),0 0 0 1px rgba(255,255,255,.8) inset;font-family:ui-sans-serif,system-ui,"Segoe UI",Roboto,sans-serif;font-size:14px;line-height:1.45;font-weight:500;pointer-events:none;word-wrap:break-word';
  document.body.appendChild(pageTooltipEl);
  return pageTooltipEl;
}

function hidePageTooltip(){
  try{
    var g=getPageTooltipEl();
    g.style.display='none';
    g.textContent='';
  }catch(_e){}
  pageTooltipOwner=null;
}

function anchorRectForTooltipLayout(anchor){
  try{
    var n=anchor;
    var safety=0;
    while(n&&n.nodeType===1&&safety<10){
      var r=n.getBoundingClientRect();
      if(r.width>=2&&r.height>=2){return r;}
      n=n.parentElement;
    }
  }catch(_e){}
  try{return anchor.getBoundingClientRect();}catch(_e2){return{left:0,top:0,width:0,height:0};}
}
function layoutPageTooltip(anchor,text){
  var g=getPageTooltipEl();
  g.textContent=text;
  g.style.display='block';
  g.style.visibility='hidden';
  var tw=g.offsetWidth||0;
  var th=g.offsetHeight||0;
  var r=anchorRectForTooltipLayout(anchor);
  var vw=window.innerWidth||0;
  var vh=window.innerHeight||0;
  var x=r.left+r.width/2-tw/2;
  var y=r.bottom+10;
  if(x<8){x=8;}
  if(tw>0&&x+tw>vw-8){x=Math.max(8,vw-tw-8);}
  if(th>0&&y+th>vh-8){y=r.top-th-10;}
  if(y<8){y=8;}
  g.style.left=Math.round(x)+'px';
  g.style.top=Math.round(y)+'px';
  g.style.visibility='visible';
}

function migrateTitlesForTooltips(){
  try{
    var nodes=document.querySelectorAll('[title]');
    for(var i=0;i<nodes.length;i++){
      var n=nodes[i];
      if(!n||n.nodeType!==1){continue;}
      if(nodeInsideA11yChrome(n)){continue;}
      var tv=String(n.getAttribute('title')||'').trim();
      if(!tv){continue;}
      if(n.hasAttribute('data-carbon-orig-title')){continue;}
      n.setAttribute('data-carbon-orig-title',tv);
      n.removeAttribute('title');
    }
  }catch(_e){}
}

function restoreCarbonTitles(){
  try{
    var nodes=document.querySelectorAll('[data-carbon-orig-title]');
    for(var i=0;i<nodes.length;i++){
      var n=nodes[i];
      if(!n||n.nodeType!==1){continue;}
      if(nodeInsideA11yChrome(n)){continue;}
      var t=n.getAttribute('data-carbon-orig-title');
      if(t!=null){n.setAttribute('title',t);}
      n.removeAttribute('data-carbon-orig-title');
    }
  }catch(_e){}
}

function onPageTooltipViewportChange(){
  hidePageTooltip();
  pageTooltipFocus=false;
}

function onPagePointerOver(ev){
  if(pageTooltipFocus){return;}
  if(!tooltipFeatureActive()||!state.enhancedTooltips){return;}
  var t=tooltipEventTargetElement(ev);
  if(!t){return;}
  var src=findTooltipSource(t);
  if(!src){return;}
  pageTooltipOwner=src.el;
  layoutPageTooltip(src.el,src.text);
}

function onPagePointerOut(ev){
  if(pageTooltipFocus){return;}
  if(!pageTooltipOwner){return;}
  var rel=ev.relatedTarget;
  try{
    if(rel&&pageTooltipOwner.contains(rel)){return;}
  }catch(_e){}
  hidePageTooltip();
}

function onPageFocusIn(ev){
  if(!tooltipFeatureActive()||!state.enhancedTooltips){return;}
  var t=tooltipEventTargetElement(ev);
  if(!t){return;}
  var src=findTooltipSource(t);
  if(!src){return;}
  hidePageTooltip();
  pageTooltipFocus=true;
  pageTooltipOwner=src.el;
  layoutPageTooltip(src.el,src.text);
}

function onPageFocusOut(ev){
  pageTooltipFocus=false;
  if(!pageTooltipOwner){return;}
  var rel=ev.relatedTarget;
  try{
    if(rel&&pageTooltipOwner.contains(rel)){return;}
  }catch(_e2){}
  hidePageTooltip();
}

function disconnectTooltipTitleObserver(){
  try{
    if(tooltipTitleObserver){
      tooltipTitleObserver.disconnect();
      tooltipTitleObserver=null;
    }
  }catch(_e){}
}
function connectTooltipTitleObserver(){
  disconnectTooltipTitleObserver();
  if(!tooltipFeatureActive()||!state.enhancedTooltips){return;}
  try{
    var obs=new MutationObserver(function(){
      clearTimeout(obs._caDeb);
      obs._caDeb=setTimeout(function(){
        try{migrateTitlesForTooltips();}catch(_m){}
      },120);
    });
    obs.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['title']});
    tooltipTitleObserver=obs;
  }catch(_e2){}
}
function unbindPageTooltipEvents(){
  if(!pageTooltipBound){return;}
  disconnectTooltipTitleObserver();
  document.removeEventListener('pointerover',onPagePointerOver,true);
  document.removeEventListener('pointerout',onPagePointerOut,true);
  document.removeEventListener('focusin',onPageFocusIn,true);
  document.removeEventListener('focusout',onPageFocusOut,true);
  window.removeEventListener('scroll',onPageTooltipViewportChange,true);
  window.removeEventListener('resize',onPageTooltipViewportChange);
  pageTooltipBound=false;
}

function bindPageTooltipEvents(){
  if(pageTooltipBound){return;}
  document.addEventListener('pointerover',onPagePointerOver,true);
  document.addEventListener('pointerout',onPagePointerOut,true);
  document.addEventListener('focusin',onPageFocusIn,true);
  document.addEventListener('focusout',onPageFocusOut,true);
  window.addEventListener('scroll',onPageTooltipViewportChange,true);
  window.addEventListener('resize',onPageTooltipViewportChange);
  pageTooltipBound=true;
}

function syncEnhancedTooltips(){
  try{
    if(!tooltipFeatureActive()||!state.enhancedTooltips){
      unbindPageTooltipEvents();
      restoreCarbonTitles();
      hidePageTooltip();
      pageTooltipFocus=false;
      return;
    }
    migrateTitlesForTooltips();
    bindPageTooltipEvents();
    connectTooltipTitleObserver();
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
  if(state.contrastMode==='invert'){
    css.push('html,body{background:transparent !important;}');
    var inv='invert(1) hue-rotate(180deg)';
    if(sat!=='none'){css.push('html{filter:'+inv+' '+sat+' !important;}');}else{css.push('html{filter:'+inv+' !important;}');}
    css.push('img,video,iframe,picture{filter:'+inv+' !important;}');
  }else if(state.contrastMode==='light'){
    css.push('html,body{background:#fff !important;color:#111 !important;}');
    css.push('a,a:visited{color:#1d4ed8 !important;}');
    if(sat!=='none'){css.push('html{filter:'+sat+' !important;}');}
  }else if(state.contrastMode==='smart'){
    css.push('html,body{background:#0b0b0b !important;color:#f8fafc !important;}');
    css.push('a,a:visited{color:#93c5fd !important;}');
    if(sat!=='none'){css.push('html{filter:'+sat+' !important;}');}
  }else if(state.contrastMode==='dark'||state.highContrast){
    css.push('html,body{background:#000 !important;color:#fff !important;}');
    css.push('a,a:visited{color:#93c5fd !important;}');
    if(sat!=='none'){css.push('html{filter:'+sat+' !important;}');}
  }else{
    if(sat!=='none'){css.push('html{filter:'+sat+' !important;}');}
  }
  if(state.readableFont){css.push('html,body,*{font-family:"Atkinson Hyperlegible","Segoe UI",Arial,sans-serif !important;}');}
  if(state.pauseAnimations){
    css.push('*,*::before,*::after{animation:none !important;transition:none !important;scroll-behavior:auto !important;}');
    css.push('video{animation:none !important;}');
  }
  if(state.highlightLinks){css.push('a{outline:2px dashed #f59e0b !important;outline-offset:2px !important;border-radius:4px;}');}
  if(state.hideImages){css.push('img,svg,picture,video,canvas{visibility:hidden !important;}');}
  if(state.bigCursor){
    try{
      root.classList.add('ca-a11y-big-cursor');
      root.classList.add('ca-a11y-cursor-xl');
    }catch(_bc){}
    css.push(
      'html.ca-a11y-big-cursor.ca-a11y-cursor-xl body,html.ca-a11y-big-cursor.ca-a11y-cursor-xl body *{cursor:none !important;}'
    );
    css.push(
      'html.ca-a11y-big-cursor.ca-a11y-cursor-xl body *::before,html.ca-a11y-big-cursor.ca-a11y-cursor-xl body *::after{cursor:none !important;}'
    );
    css.push(
      'html.ca-a11y-big-cursor.ca-a11y-cursor-xl input:not([type]),html.ca-a11y-big-cursor.ca-a11y-cursor-xl input[type="text"],html.ca-a11y-big-cursor.ca-a11y-cursor-xl input[type="search"],html.ca-a11y-big-cursor.ca-a11y-cursor-xl input[type="email"],html.ca-a11y-big-cursor.ca-a11y-cursor-xl input[type="url"],html.ca-a11y-big-cursor.ca-a11y-cursor-xl input[type="tel"],html.ca-a11y-big-cursor.ca-a11y-cursor-xl input[type="password"],html.ca-a11y-big-cursor.ca-a11y-cursor-xl input[type="number"],html.ca-a11y-big-cursor.ca-a11y-cursor-xl textarea,html.ca-a11y-big-cursor.ca-a11y-cursor-xl select,html.ca-a11y-big-cursor.ca-a11y-cursor-xl [contenteditable="true"],html.ca-a11y-big-cursor.ca-a11y-cursor-xl [contenteditable="plaintext-only"]{cursor:text !important;}'
    );
  }else{
    try{
      root.classList.remove('ca-a11y-big-cursor');
      root.classList.remove('ca-a11y-cursor-xl');
    }catch(_bc2){}
  }
  if(spacing!=='normal'){css.push('p,li,button,input,textarea,select,a,span,div{letter-spacing:'+spacing+' !important;word-spacing:'+spacing+' !important;}');}
  if(line!=='1.5'){css.push('p,li,button,input,textarea,select,a,span,div{line-height:'+line+' !important;}');}
  if(align!=='initial'){css.push('p,li,div,section,article,main{text-align:'+align+' !important;}');}
  styleTag.textContent=css.join("\\n");
  try{
    if(document.head&&styleTag){document.head.appendChild(styleTag);}
  }catch(_mv){}
  guideLine.style.display=state.readingGuide?'block':'none';
  readingMask.style.display=state.readingMask?'block':'none';
  syncReadingPointerMoveListener();
  syncAssistShellLangDir();
  syncShellLocaleClass();
  syncWidgetMotionClass();
  syncShadowBigCursorStyle();
  syncEnhancedTooltips();
  syncPanelThemeClass();
  syncPlainPanelClass();
  syncPauseAnimationsMedia();
  syncBigCursorOverlay();
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
    bigCursor:'bigCursorOn',
    plainLightUi:'plainLightUiOn',
    oversizedUi:'oversizedUiOn',
    enhancedTooltips:'enhancedTooltipsOn'
  };
  var mapOff={
    highContrast:'highContrastOff',
    readableFont:'readableFontOff',
    pauseAnimations:'pauseAnimationsOff',
    highlightLinks:'highlightLinksOff',
    hideImages:'hideImagesOff',
    readingGuide:'readingGuideOff',
    readingMask:'readingMaskOff',
    bigCursor:'bigCursorOff',
    plainLightUi:'plainLightUiOff',
    oversizedUi:'oversizedUiOff',
    enhancedTooltips:'enhancedTooltipsOff'
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

function tileGlyphFor(key){
  var m={highContrast:'◐',readableFont:'aA',pauseAnimations:'‖',highlightLinks:'∞',hideImages:'▦',readingGuide:'═',readingMask:'▢',bigCursor:'⤢',enhancedTooltips:'\u2139'};
  return m[String(key)]||'·';
}
function makeTileAction(label,key,onToggle,hintText){
  var btn=document.createElement('button');
  btn.type='button';
  btn.className='ca-assist-tile';
  btn.setAttribute('role','switch');
  btn.setAttribute('data-carbon-key','tile-'+String(key));
  var lid='ca-assist-tile-lbl-'+String(key);
  var glyph=document.createElement('span');
  glyph.className='ca-assist-tile__glyph';
  glyph.setAttribute('aria-hidden','true');
  glyph.textContent=tileGlyphFor(key);
  var textCol=document.createElement('span');
  textCol.className='ca-assist-tile__text';
  var labelNode=document.createElement('span');
  labelNode.className='ca-assist-tile__label';
  labelNode.id=lid;
  labelNode.textContent=label;
  btn.setAttribute('aria-labelledby',lid);
  textCol.appendChild(labelNode);
  if(hintText){
    var hint=document.createElement('span');
    hint.className='ca-assist-tile__hint';
    hint.textContent=hintText;
    textCol.appendChild(hint);
  }
  var sw=document.createElement('span');
  sw.className='ca-assist-tile__switch';
  sw.setAttribute('aria-hidden','true');
  var switchTrack=document.createElement('span');
  switchTrack.className='ca-assist-tile__track';
  var thumb=document.createElement('span');
  thumb.className='ca-assist-tile__thumb';
  switchTrack.appendChild(thumb);
  sw.appendChild(switchTrack);
  btn.appendChild(glyph);
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
  btn.addEventListener('click',function(ev){
    try{if(ev&&typeof ev.stopPropagation==='function')ev.stopPropagation();}catch(_sp){}
    onClick();
  });
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

function makeTextScaleRow(){
  var wrap=document.createElement('div');
  wrap.className='ca-assist-field ca-assist-field--textscale-row';
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

function resetAssistStateBaseline(){
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
}
function applyProfile(name){
  if(name==='clear'){
    resetAssistStateBaseline();
    state.plainLightUi=false;
    state.oversizedUi=false;
    state.enhancedTooltips=false;
    state.language=config.language||'en';
  }else{
    resetAssistStateBaseline();
    if(name==='blind'){
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

function forEachElementDepthFirst(root,visit){
  if(!root)return;
  if(root.nodeType===1){
    visit(root);
    var child=root.firstElementChild;
    while(child){
      forEachElementDepthFirst(child,visit);
      child=child.nextElementSibling;
    }
    if(root.shadowRoot)forEachElementDepthFirst(root.shadowRoot,visit);
  }else if(root.nodeType===11){
    var c=root.firstElementChild;
    while(c){
      forEachElementDepthFirst(c,visit);
      c=c.nextElementSibling;
    }
  }
}
function querySelectorMatchesDeep(docRoot,selector){
  var parts=String(selector||'').split(',').map(function(s){return s.trim();}).filter(Boolean);
  if(!parts.length){return[];}
  function matches(el){
    try{
      for(var p=0;p<parts.length;p++){
        if(el.matches(parts[p]))return true;
      }
    }catch(_e){}
    return false;
  }
  var out=[];
  forEachElementDepthFirst(docRoot,function(el){
    if(matches(el))out.push(el);
  });
  return out;
}
function jumpMainContentRootSelectors(){
  return '#MainContent,main#MainContent,main[role="main"],main,[role="main"],#main,.main-content,.content-for-layout,#content,.page-content,#main-content,.template-content';
}
function filterJumpTargetsToMainContent(found){
  if(!found||!found.length){return found;}
  var roots=[];
  try{
    var parts=jumpMainContentRootSelectors().split(',');
    for(var p=0;p<parts.length;p++){
      var sel=String(parts[p]||'').trim();
      if(!sel){continue;}
      try{
        var nl=document.querySelectorAll(sel);
        for(var i=0;i<nl.length;i++){
          var n=nl[i];
          if(n&&n.nodeType===1){roots.push(n);}
        }
      }catch(_q){}
    }
  }catch(_r){}
  if(!roots.length){return found;}
  var out=[];
  for(var f=0;f<found.length;f++){
    var el=found[f];
    for(var r=0;r<roots.length;r++){
      try{
        if(roots[r].contains(el)){out.push(el);break;}
      }catch(_c){}
    }
  }
  return out.length?out:found;
}
function reorderHeadingCandidatesByLevel(found){
  if(!found||!found.length){return found;}
  var tags=['h1','h2','h3','h4','h5','h6'];
  var buckets={h1:[],h2:[],h3:[],h4:[],h5:[],h6:[]};
  var rest=[];
  var i,j,t,el;
  for(i=0;i<found.length;i++){
    el=found[i];
    t=(el.tagName||'').toLowerCase();
    var hit=false;
    for(j=0;j<tags.length;j++){
      if(t===tags[j]){
        buckets[t].push(el);
        hit=true;
        break;
      }
    }
    if(!hit){rest.push(el);}
  }
  var out=[];
  for(j=0;j<tags.length;j++){
    var arr=buckets[tags[j]];
    for(i=0;i<arr.length;i++){out.push(arr[i]);}
  }
  for(i=0;i<rest.length;i++){out.push(rest[i]);}
  return out.length?out:found;
}
function isLikelyInsideCarbonWidget(el){
  var w=document.getElementById('carbon-a11y-widget');
  if(!w||!el)return false;
  if(el===w)return true;
  try{
    if(w.shadowRoot&&w.shadowRoot.contains(el))return true;
  }catch(_e){}
  return false;
}
function isProbablyVisible(el){
  if(!el||el.nodeType!==1)return false;
  try{
    var st=window.getComputedStyle(el);
    if(st.display==='none'||st.visibility==='hidden'||parseFloat(st.opacity||'1')===0)return false;
    var r=el.getBoundingClientRect();
    if(r.width<2&&r.height<2)return false;
  }catch(_e){return false;}
  return true;
}
function isSkippableJumpTarget(el){
  if(!el||el.nodeType!==1)return true;
  try{
    var cur=el;
    while(cur){
      if(cur.nodeType===1){
        try{
          if(cur.getAttribute&&cur.getAttribute('aria-hidden')==='true'){return true;}
          if(cur.inert){return true;}
        }catch(_a){}
      }
      if(cur.parentElement){cur=cur.parentElement;}
      else{
        var rn=cur.getRootNode&&cur.getRootNode();
        if(rn&&rn.nodeType===11&&rn.host){cur=rn.host;}
        else{break;}
      }
    }
  }catch(_e){}
  return false;
}
function getJumpViewportPaddingTop(){
  try{
    var st=window.getComputedStyle(document.documentElement);
    var v=parseFloat(st.scrollPaddingTop);
    if(!isNaN(v)&&v>0){return v;}
    var b=document.body;
    if(b){
      var st2=window.getComputedStyle(b);
      var v2=parseFloat(st2.scrollPaddingTop);
      if(!isNaN(v2)&&v2>0){return v2;}
    }
  }catch(_e){}
  return 0;
}
function getStickyHeaderTopReserve(){
  var max=0;
  try{
    var sel='header,[role="banner"],#shopify-section-header,.shopify-section-header-sticky,.section-header,.header--sticky,.site-header,.main-header,#header';
    var q=document.querySelectorAll(sel);
    var i,r,cs,pos;
    for(i=0;i<q.length;i++){
      var e=q[i];
      cs=window.getComputedStyle(e);
      if(cs.display==='none'||cs.visibility==='hidden'){continue;}
      pos=cs.position;
      if(pos!=='fixed'&&pos!=='sticky'){continue;}
      r=e.getBoundingClientRect();
      if(r.height<12||r.height>220){continue;}
      if(r.top<=6&&r.bottom>max){max=r.bottom;}
    }
  }catch(_e){}
  return Math.min(Math.round(max)+12,220);
}
function scrollParentYScrollable(par){
  if(!par||par.nodeType!==1){return false;}
  try{
    var st=window.getComputedStyle(par);
    var oy=st.overflowY;
    var os=st.overflow;
    var yOk=(oy==='auto'||oy==='scroll'||oy==='overlay');
    var osOk=(os==='auto'||os==='scroll'||os==='overlay');
    if(!(yOk||osOk)){return false;}
    return par.scrollHeight>par.clientHeight+2;
  }catch(_e){return false;}
}
function collectScrollableAncestorsForJump(el){
  var scrollables=[];
  try{
    var node=el;
    while(node){
      var par=node.parentElement;
      if(!par){break;}
      if(scrollParentYScrollable(par)){
        scrollables.push(par);
      }
      if(par===document.documentElement){break;}
      node=par;
    }
    var sse=document.scrollingElement;
    if(sse&&sse.nodeType===1&&scrollables.indexOf(sse)<0&&scrollParentYScrollable(sse)){
      scrollables.push(sse);
    }
  }catch(_c){}
  return scrollables;
}
function scrollScrollableAncestorsForJump(el){
  try{
    var pad=8;
    var maxIter=40;
    var scrollables=collectScrollableAncestorsForJump(el);
    var si,iter,pr,er,delta,prevTop;
    for(si=0;si<scrollables.length;si++){
      var p=scrollables[si];
      for(iter=0;iter<maxIter;iter++){
        pr=p.getBoundingClientRect();
        er=el.getBoundingClientRect();
        delta=er.top-pr.top-pad;
        if(Math.abs(delta)<=2){break;}
        prevTop=p.scrollTop;
        p.scrollTop+=Math.round(delta);
        if(p.scrollTop===prevTop){break;}
      }
    }
  }catch(_o){}
}
function scrollJumpTargetToViewportStart(el){
  try{
    if(typeof el.scrollIntoView==='function'){
      el.scrollIntoView({behavior:'auto',block:'start',inline:'nearest'});
    }
  }catch(_e0){}
  function alignAncestors(){
    try{scrollScrollableAncestorsForJump(el);}catch(_an){}
  }
  alignAncestors();
  function alignWindowToTop(){
    try{
      var pad=getJumpViewportPaddingTop()+getStickyHeaderTopReserve();
      var round,maxR=12,delta,r,se,prevTop,sm,cs,mt;
      for(round=0;round<maxR;round++){
        r=el.getBoundingClientRect();
        sm=0;
        try{
          cs=window.getComputedStyle(el);
          mt=parseFloat(cs.scrollMarginTop);
          if(!isNaN(mt)){sm=mt;}
        }catch(_m){}
        delta=r.top-(pad+sm);
        if(Math.abs(delta)<=1){break;}
        se=document.scrollingElement;
        if(se&&se.nodeType===1&&typeof se.scrollTop==='number'){
          prevTop=se.scrollTop;
          se.scrollTop=se.scrollTop+Math.round(delta);
          if(se.scrollTop===prevTop&&Math.abs(delta)>2){
            window.scrollBy({left:0,top:Math.round(delta),behavior:'auto'});
          }
        }else{
          window.scrollBy({left:0,top:Math.round(delta),behavior:'auto'});
        }
      }
    }catch(_e1){}
  }
  requestAnimationFrame(function(){
    alignAncestors();
    alignWindowToTop();
    requestAnimationFrame(function(){
      alignWindowToTop();
      alignAncestors();
      setTimeout(function(){
        try{
          alignWindowToTop();
          alignAncestors();
        }catch(_t){}
      },0);
      try{
        el.setAttribute('tabindex','-1');
        if(typeof el.focus==='function'){el.focus({preventScroll:true});}
      }catch(_f){}
    });
  });
}
function tryResolvePrimaryMainHeading(){
  var sels=[
    '#MainContent h1',
    'main#MainContent h1',
    'main[role="main"] h1',
    'main h1',
    '[role="main"] h1',
    '#main h1',
    '.main-content h1',
    '#MainContent [role="heading"][aria-level="1"]',
    'main [role="heading"][aria-level="1"]',
    '[role="main"] [role="heading"][aria-level="1"]'
  ];
  var pass,si,sj,hit,list;
  for(pass=0;pass<2;pass++){
    for(si=0;si<sels.length;si++){
      try{
        list=document.querySelectorAll(sels[si]);
        for(sj=0;sj<list.length;sj++){
          hit=list[sj];
          if(!hit||hit.nodeType!==1){continue;}
          if(isLikelyInsideCarbonWidget(hit)){continue;}
          if(isSkippableJumpTarget(hit)){continue;}
          if(pass===0&&!isProbablyVisible(hit)){continue;}
          return hit;
        }
      }catch(_e){}
    }
  }
  return null;
}
function jumpToSelector(selector,okMsg,noneMsg){
  var docEl=document.documentElement;
  if(!docEl){
    announce(noneMsg);
    return false;
  }
  var selStr=String(selector||'');
  var isHeadingJump=selStr.indexOf('h1')>=0||selStr.indexOf('role="heading"')>=0||selStr.indexOf("role='heading'")>=0;
  if(isHeadingJump){
    var primeHit=tryResolvePrimaryMainHeading();
    if(primeHit){
      scrollJumpTargetToViewportStart(primeHit);
      announce(okMsg);
      return true;
    }
  }
  var found=querySelectorMatchesDeep(docEl,selector);
  found=filterJumpTargetsToMainContent(found);
  if(selStr.indexOf('h1')>=0||selStr.indexOf('role="heading"')>=0||selStr.indexOf("role='heading'")>=0){
    found=reorderHeadingCandidatesByLevel(found);
  }
  if(!found.length){
    announce(noneMsg);
    return false;
  }
  var target=null;
  var i,el;
  for(i=0;i<found.length;i++){
    el=found[i];
    if(isLikelyInsideCarbonWidget(el))continue;
    if(isSkippableJumpTarget(el))continue;
    if(isProbablyVisible(el)){target=el;break;}
  }
  if(!target){
    for(i=0;i<found.length;i++){
      el=found[i];
      if(isLikelyInsideCarbonWidget(el))continue;
      if(isSkippableJumpTarget(el))continue;
      target=el;
      break;
    }
  }
  if(!target){
    announce(noneMsg);
    return false;
  }
  scrollJumpTargetToViewportStart(target);
  announce(okMsg);
  return true;
}

var lastReadingPointerApplyMs=0;
var readingPointerRaf=0;
var latestPointerY=0;
var __readingPointerMoveBound=false;
function applyReadingPointerLayout(y){
  if(!state.readingGuide&&!state.readingMask){return;}
  guideLine.style.top=(y+1)+'px';
  var top=Math.max(0,y-45);
  var bottom=Math.max(0,(window.innerHeight||0)-y-45);
  readingMask.style.background='linear-gradient(to bottom, rgba(0,0,0,0.62) 0, rgba(0,0,0,0.62) '+top+'px, rgba(0,0,0,0) '+(top+1)+'px, rgba(0,0,0,0) '+(top+90)+'px, rgba(0,0,0,0.62) '+(top+91)+'px, rgba(0,0,0,0.62) calc(100% - '+bottom+'px))';
}
function flushReadingPointerFromRaf(){
  readingPointerRaf=0;
  if(!state.readingGuide&&!state.readingMask){return;}
  lastReadingPointerApplyMs=Date.now();
  applyReadingPointerLayout(latestPointerY);
}
function handlePointerMove(event){
  if(!state.readingGuide&&!state.readingMask){return;}
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
function syncReadingPointerMoveListener(){
  try{
    var need=state.readingGuide||state.readingMask;
    if(need){
      if(!__readingPointerMoveBound){
        document.addEventListener('mousemove',handlePointerMove,{passive:true});
        __readingPointerMoveBound=true;
      }
    }else{
      if(__readingPointerMoveBound){
        document.removeEventListener('mousemove',handlePointerMove);
        __readingPointerMoveBound=false;
      }
      if(readingPointerRaf){
        cancelAnimationFrame(readingPointerRaf);
        readingPointerRaf=0;
      }
    }
  }catch(_e){}
}

function caResolveLogoUrl(raw){
  raw=String(raw||'').trim();
  if(!raw){return '';}
  if(/^data:image\\//i.test(raw)){return raw;}
  if(__caLogoProxy){
    try{return new URL('/api/accessibility/brand-image?scope='+encodeURIComponent(scope),__caWidgetOrigin).href;}catch(_e){}
  }
  return raw;
}
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
  a.textContent='ASSIST';
  w.appendChild(c);
  w.appendChild(a);
  return w;
}
function buildHeaderBrandStrip(){
  var box=document.createElement('div');
  box.className='ca-assist-strip-cluster';
  var stripPx=stripLogoAppliedMaxPx()+'px';
  var url=String(config.logoUrl||'').trim();
  if(url){
    var img=document.createElement('img');
    img.className='ca-assist-logo-img ca-assist-logo-img--strip';
    img.alt=String(config.logoAlt||'Carbon Assist');
    img.decoding='async';
    img.loading='lazy';
    img.src=caResolveLogoUrl(url);
    img.style.maxHeight=stripPx;
    img.style.width='auto';
    img.style.objectFit='contain';
    img.addEventListener('error',function(){
      try{box.removeChild(img);}catch(_e){}
      if(box.querySelector('img.ca-assist-carbon-mark-fallback')){return;}
      try{
        var fb=document.createElement('img');
        fb.className='ca-assist-logo-img ca-assist-logo-img--strip ca-assist-logo-img--carbon-default ca-assist-carbon-mark-fallback';
        fb.alt=String(config.logoAlt||'Carbon');
        fb.decoding='async';
        fb.loading='lazy';
        fb.src=caDefaultCarbonMarkSrc();
        fb.style.maxHeight=stripPx;
        fb.style.width='auto';
        fb.style.objectFit='contain';
        var mw=box.querySelector('.ca-assist-markword');
        if(mw){box.insertBefore(fb,mw);}
        else{box.appendChild(fb);}
      }catch(_e2){}
    });
    box.appendChild(img);
  }else{
    try{
      var defMark=caDefaultCarbonMarkSrc();
      if(defMark){
        var dm=document.createElement('img');
        dm.className='ca-assist-logo-img ca-assist-logo-img--strip ca-assist-logo-img--carbon-default';
        dm.alt=String(config.logoAlt||'Carbon');
        dm.decoding='async';
        dm.loading='lazy';
        dm.src=defMark;
        dm.style.maxHeight=stripPx;
        dm.style.width='auto';
        dm.style.objectFit='contain';
        dm.addEventListener('error',function(){try{box.removeChild(dm);}catch(_e2){}});
        box.appendChild(dm);
      }
    }catch(_d){}
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
    img.src=caResolveLogoUrl(url);
    var mh;
    if(slot==='footer'){
      mh=footerLogoAppliedMaxPx();
    }else{
      mh=Number(config.logoMaxHeight);
      if(!isFinite(mh)||mh<12){mh=slot==='launcher'?22:32;}
      var v=String(config.logoVariant||'wordmark');
      if(slot==='launcher'){
        if(v==='symbol'){mh=Math.min(mh,22);}
        else if(v==='full'){mh=Math.min(mh,30);}
        else{mh=Math.min(mh,26);}
      }else{
        mh=Math.min(mh,44);
      }
    }
    img.style.maxHeight=mh+'px';
    img.style.width='auto';
    img.style.objectFit='contain';
    img.addEventListener('error',function(){
      wrap.innerHTML='';
      try{
        var fms=caDefaultCarbonMarkSrc();
        if(fms){
          var fb=document.createElement('img');
          fb.className='ca-assist-logo-img ca-assist-logo-img--carbon-default'+(slot==='footer'?' ca-assist-logo-img--footer-mark':'');
          fb.alt=String(config.logoAlt||'Carbon');
          fb.decoding='async';
          fb.loading='lazy';
          fb.src=fms;
          fb.style.maxHeight=slot==='footer'?'28px':(slot==='launcher'?'26px':'44px');
          fb.style.width='auto';
          fb.style.objectFit='contain';
          wrap.appendChild(fb);
        }
      }catch(_fb){}
      var ex=slot==='launcher'?'ca-assist-markword--launcher':slot==='footer'?'ca-assist-markword--footer':'ca-assist-markword--strip';
      wrap.appendChild(buildMarkwordStack(ex));
    });
    wrap.appendChild(img);
    var exWithLogo=slot==='launcher'?'ca-assist-markword--launcher':slot==='footer'?'ca-assist-markword--footer':'ca-assist-markword--strip';
    wrap.appendChild(buildMarkwordStack(exWithLogo));
    return wrap;
  }
  var ex=slot==='launcher'?'ca-assist-markword--launcher':slot==='footer'?'ca-assist-markword--footer':'ca-assist-markword--strip';
  if(slot==='footer'){
    try{
      var fm=caDefaultCarbonMarkSrc();
      if(fm){
        var fim=document.createElement('img');
        fim.className='ca-assist-logo-img ca-assist-logo-img--footer-mark';
        fim.alt=String(config.logoAlt||'Carbon');
        fim.decoding='async';
        fim.loading='lazy';
        fim.src=fm;
        fim.style.maxHeight=footerLogoAppliedMaxPx()+'px';
        fim.style.width='auto';
        fim.style.objectFit='contain';
        fim.addEventListener('error',function(){try{wrap.removeChild(fim);}catch(_e3){}});
        wrap.appendChild(fim);
      }
    }catch(_f){}
  }
  wrap.appendChild(buildMarkwordStack(ex));
  return wrap;
}

function createWidget(){
  var wrap=document.createElement("div");
  wrap.id="carbon-a11y-widget";
  wrap.style.position="fixed";
  wrap.style.zIndex="2147483646";
  wrap.style.isolation="isolate";
  wrap.style.touchAction="none";
  wrap.style.setProperty('--ca-accent',String(config.brandColor||'#6d28d9'));
  wrap.style.setProperty('--ca-panel',String(config.panelColor||'#0b0c0f'));
  wrap.style.border='none';
  wrap.style.outline='none';
  wrap.style.background='transparent';
  wrap.style.boxShadow='none';
  var launcherDrag={active:false,pointerId:null,startX:0,startY:0,origLeft:0,origTop:0,moved:false,suppressClick:false};
  var launcherPosKey=storageKey+'::fabPos';
  var dockOpenRight=String(config.position||'right')!=='left';
  var viewportPushBaseR=null;
  var viewportPushBaseL=null;
  function fabSize(){
    var base=Math.max(48,Math.min(96,Number(config.triggerSize)||52));
    if(state.oversizedUi){
      return Math.max(72,Math.min(118,Math.round(base*1.24)));
    }
    return base;
  }
  function effectivePanelWidthPx(){
    var raw=Number(config.panelWidth);
    if(!isFinite(raw)){raw=400;}
    var pw=Math.max(280,Math.min(520,Math.round(raw)));
    if(state.oversizedUi){
      pw=Math.min(520,Math.round(pw*1.07)+36);
    }
    return Math.round(pw);
  }
  function fabSafeInsets(){
    var iw=window.innerWidth||0,ih=window.innerHeight||0;
    var minL=8,minT=8,minR=8,minB=10;
    try{
      var vv=window.visualViewport;
      if(vv&&typeof vv.width==='number'&&vv.width>8&&typeof vv.height==='number'&&vv.height>8){
        var ox=Number(vv.offsetLeft)||0,oy=Number(vv.offsetTop)||0;
        var vvw=Math.round(vv.width),vvh=Math.round(vv.height);
        minL=Math.max(minL,Math.round(ox)+8);
        minT=Math.max(minT,Math.round(oy)+8);
        var gapR=iw-Math.round(ox+vvw);
        var gapB=ih-Math.round(oy+vvh);
        minR=Math.max(minR,gapR+10);
        minB=Math.max(minB,gapB+10);
      }
    }catch(_e){}
    return{minL:minL,minT:minT,minR:minR,minB:minB,iw:iw,ih:ih};
  }
  /** Bottom-right FABs via cheap hit-tests only (no full-body getComputedStyle scan — safe on large Shopify DOMs). */
  function fabStripRects(wrapEl){
    var ins=fabSafeInsets();
    var iw=ins.iw, ih=ins.ih;
    var out=[];
    var seen=new WeakSet();
    function pushFixedEl(el){
      if(!el||el.nodeType!==1)return;
      if(el===wrapEl)return;
      try{if(wrapEl&&wrapEl.contains(el))return;}catch(_x){}
      if(seen.has(el))return;
      var cs=window.getComputedStyle(el);
      if(cs.position!=='fixed'&&cs.position!=='sticky')return;
      if(cs.visibility==='hidden'||cs.display==='none')return;
      var op=parseFloat(cs.opacity);
      if(isFinite(op)&&op<0.04)return;
      var zi=parseInt(cs.zIndex,10);
      if(isFinite(zi)&&zi>=2147483640)return;
      var r=el.getBoundingClientRect();
      if(r.width<6||r.height<6)return;
      if(r.width>iw*0.62)return;
      if(r.bottom<ih-168||r.right<iw-280)return;
      if(r.top<ih-200)return;
      seen.add(el);
      out.push(r);
    }
    function probe(px,py){
      var list;
      try{list=document.elementsFromPoint(px,py);}catch(_e){return;}
      if(!list||!list.length)return;
      for(var i=0;i<list.length;i++){
        var el=list[i];
        if(!el||el.nodeType!==1)continue;
        if(el===wrapEl)continue;
        try{if(wrapEl&&wrapEl.contains(el))continue;}catch(_y){}
        var cur=el;
        while(cur&&cur!==document.body&&cur!==document.documentElement){
          if(cur===wrapEl)break;
          try{if(wrapEl&&wrapEl.contains(cur))break;}catch(_z){}
          var cs=window.getComputedStyle(cur);
          if(cs.position==='fixed'||cs.position==='sticky'){
            pushFixedEl(cur);
            return;
          }
          cur=cur.parentElement;
        }
      }
    }
    try{
      var xR=iw-ins.minR-2;
      var yB=ih-ins.minB-2;
      var pts=[[0,0],[-40,0],[-88,0],[-140,0],[-200,0],[0,-36],[0,-80],[-56,-48],[-120,-28],[-24,-100]];
      for(var p=0;p<pts.length;p++){
        var px=Math.round(xR+pts[p][0]);
        var py=Math.round(yB+pts[p][1]);
        if(px<ins.minL+2||py<ins.minT+2)continue;
        probe(px,py);
      }
    }catch(_e2){}
    return out;
  }
  function rectsOverlapFab(a,b,p){
    return !(a.left+p>=b.right-p||a.right-p<=b.left+p||a.top+p>=b.bottom-p||a.bottom-p<=b.top+p);
  }
  /** True corner first; shift left only when overlapping another FAB; match their bottom row. */
  function resolveRightDockFabRect(openSz){
    var ins=fabSafeInsets();
    var iw=ins.iw, ih=ins.ih;
    var side=Math.max(2,Number(config.sideOffset)||10);
    var bot=Math.max(2,Number(config.bottomOffset)||10);
    var GAP=Math.max(8,Math.min(18,Math.round(side*0.55+5)));
    var rects=fabStripRects(wrap);
    var left=Math.round(iw-ins.minR-side-openSz);
    var top=Math.round(ih-openSz-bot);
    if(left<ins.minL){left=ins.minL;}
    if(top<ins.minT){top=ins.minT;}
    if(top+openSz>ih-ins.minB){top=ih-ins.minB-openSz;}
    var guard=0;
    while(guard++<55){
      var mine={left:left,top:top,right:left+openSz,bottom:top+openSz};
      var blocker=null;
      for(var j=0;j<rects.length;j++){
        if(rectsOverlapFab(mine,rects[j],GAP)){blocker=rects[j];break;}
      }
      if(!blocker)break;
      left=Math.round(blocker.left-openSz-GAP);
      if(left<ins.minL){left=ins.minL;break;}
    }
    var rowBottom=0;
    for(var k=0;k<rects.length;k++){
      var rk=rects[k];
      if(rk.height>168)continue;
      if(rk.top<ih-188)continue;
      if(rk.right>=left-6&&rk.left<=iw-ins.minR+4){rowBottom=Math.max(rowBottom,rk.bottom);}
    }
    if(rowBottom>0&&rowBottom<=ih){
      var snap=Math.round(rowBottom-openSz);
      if(snap>=ins.minT&&snap+openSz<=ih-ins.minB){top=snap;}
    }
    return{left:left,top:top};
  }
  function clampFab(left,top,sz){
    var ins=fabSafeInsets();
    var minL=ins.minL,minT=ins.minT;
    var maxL=ins.iw-ins.minR-sz;
    var maxT=ins.ih-ins.minB-sz;
    if(maxL<minL){maxL=minL;}
    if(maxT<minT){maxT=minT;}
    return{left:Math.min(maxL,Math.max(minL,left)),top:Math.min(maxT,Math.max(minT,top))};
  }
  function applyFabFreePosition(left,top){
    wrap.style.left=Math.round(left)+'px';
    wrap.style.top=Math.round(top)+'px';
    wrap.style.right='auto';
    wrap.style.bottom='auto';
  }
  function dockMotionTransition(){
    return shouldMinimizeMotion()?'none':'left .68s cubic-bezier(.2,1,.28,1),top .68s cubic-bezier(.2,1,.28,1),width .45s cubic-bezier(.2,1,.28,1),height .45s cubic-bezier(.2,1,.28,1)';
  }
  function panelRevealTransition(){
    return shouldMinimizeMotion()?'none':'opacity .58s cubic-bezier(.2,1,.25,1),transform .58s cubic-bezier(.2,1,.25,1)';
  }
  function panelHideTransition(){
    return shouldMinimizeMotion()?'none':'opacity .48s cubic-bezier(.25,1,.2,1),transform .48s cubic-bezier(.25,1,.2,1)';
  }
  function armWrapMotion(){
    if(shouldMinimizeMotion()){return;}
    try{wrap.style.willChange='left, top, width, height';}catch(_wm){}
  }
  function disarmWrapMotion(){
    try{wrap.style.willChange='';}catch(_wm){}
  }
  function rootPaddingTransition(){
    return shouldMinimizeMotion()?'none':'padding-left .32s ease,padding-right .32s ease';
  }
  function clearViewportPush(){
    try{
      if(viewportPushBaseR===null){return;}
      root.style.transition=rootPaddingTransition();
      root.style.paddingRight=viewportPushBaseR>0?viewportPushBaseR+'px':'';
      root.style.paddingLeft=viewportPushBaseL>0?viewportPushBaseL+'px':'';
      viewportPushBaseR=null;
      viewportPushBaseL=null;
      setTimeout(function(){try{root.style.transition='';}catch(_e2){}},360);
    }catch(_e){}
  }
  function applyFabScreenCorner(dockRight,openSz){
    var targetLeft,targetTop;
    if(dockRight){
      var rr=resolveRightDockFabRect(openSz);
      targetLeft=rr.left;
      targetTop=rr.top;
    }else{
      var insL=fabSafeInsets();
      targetLeft=Math.round(insL.minL);
      targetTop=Math.round(insL.ih-insL.minB-openSz);
    }
    wrap.style.paddingBottom='';
    var c=clampFab(targetLeft,targetTop,openSz);
    applyFabFreePosition(c.left,c.top);
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
    var side=Math.max(2,Number(config.sideOffset)||10),bot=Math.max(2,Number(config.bottomOffset)||10);
    var left,top;
    if(saved){
      left=saved.left;
      top=saved.top;
    }else if(config.position==='left'){
      left=side;
      top=vh-sz-bot;
    }else{
      var rr0=resolveRightDockFabRect(sz);
      left=rr0.left;
      top=rr0.top;
    }
    var c=clampFab(left,top,sz);
    applyFabFreePosition(c.left,c.top);
  }
  function syncFabShellSize(shellEl,ts){
    shellEl.style.setProperty('--ca-fab-size',ts+'px');
    shellEl.style.setProperty('--ca-launcher-size',ts+'px');
  }
  function syncLauncherGlyphMetrics(){
    try{
      var tw=Math.round(Number(trigger.offsetWidth)||0);
      var ts=tw>0?tw:fabSize();
      var want=Math.max(14,Math.min(48,Math.round(Number(config.iconSize)||26)));
      var maxG=Math.max(24,Math.floor(ts*0.82));
      var minG=Math.max(18,Math.floor(ts*0.36));
      var g=Math.min(want,maxG);
      if(g<minG){g=minG;}
      trigger.style.setProperty('--ca-glyph-px',String(g)+'px');
    }catch(_g){}
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
  glyphEl.innerHTML=launcherGlyphSvg;
  trigger.appendChild(glyphEl);
  syncFabShellSize(shell,ts);
  syncLauncherGlyphMetrics();

  var panel=document.createElement("div");
  var panelId="ca-assist-panel";
  panel.id=panelId;
  panel.className='ca-assist-panel ca-assist-panel--mono';
  panel.style.display="none";
  panel.style.width=String(effectivePanelWidthPx())+"px";
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
  var brandActions=document.createElement('div');
  brandActions.className='ca-assist-brand-actions';
  brandActions.appendChild(closeBtn);
  brandRow.appendChild(brandLeft);
  brandRow.appendChild(brandActions);
  var titles=document.createElement('div');
  titles.className='ca-assist-head-titles';
  var title=document.createElement('div');
  title.id='ca-assist-panel-title';
  title.className='ca-assist-title';
  title.textContent=t('panelSubtitle');
  var hel=document.createElement('div');
  hel.id='ca-assist-panel-desc';
  hel.className='ca-assist-helper';
  hel.textContent=t('panelHelper');
  titles.appendChild(title);
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
  footer.appendChild(footerDynamic);
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
    try{
      title.textContent=t('panelSubtitle');
      hel.textContent=t('panelHelper');
      closeBtn.setAttribute('aria-label',t('closePanel'));
    }catch(_ttl){}
    while(panelBody.firstChild){panelBody.removeChild(panelBody.lastChild);}
    while(footerDynamic.firstChild){footerDynamic.removeChild(footerDynamic.lastChild);}

    var blocks={};
      var chromeRow=document.createElement('div');
      chromeRow.className='ca-assist-stack';
      chromeRow.appendChild(makeAction(t('plainLightUi'),'plainLightUi',function(){
        syncPlainPanelClass();
      },t('plainLightUiHelp')));
      chromeRow.appendChild(makeAction(t('oversizedUi'),'oversizedUi',function(){
        syncOversizedShellClass();
        refitAssistChromeFromState();
      },t('oversizedUiHelp')));
      var chromeBlock=document.createElement('div');
      chromeBlock.className='ca-assist-sec-group ca-assist-sec-group--panel-chrome';
      var chromeHdr=document.createElement('div');
      chromeHdr.className='ca-assist-sec-group-header';
      chromeHdr.textContent=t('sectionPanelChrome');
      var chromeBody=document.createElement('div');
      chromeBody.className='ca-assist-sec-group-body';
      chromeBody.appendChild(chromeRow);
      chromeBlock.appendChild(chromeHdr);
      chromeBlock.appendChild(chromeBody);
      blocks.chrome=chromeBlock;

      if(config.features.profiles){
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
        var clearProfile=document.createElement('button');
        clearProfile.type='button';
        clearProfile.className='ca-assist-profile-clear';
        clearProfile.setAttribute('data-carbon-key','profile-clear');
        clearProfile.textContent=t('profileClear');
        clearProfile.addEventListener('click',function(){applyProfile('clear');});
        var profBlock=document.createElement('div');
        profBlock.className='ca-assist-sec-group';
        var profHdr=document.createElement('div');
        profHdr.className='ca-assist-sec-group-header';
        profHdr.textContent=t('profiles');
        var profBody=document.createElement('div');
        profBody.className='ca-assist-sec-group-body';
        profBody.appendChild(profilesWrap);
        profBody.appendChild(clearProfile);
        profBlock.appendChild(profHdr);
        profBlock.appendChild(profBody);
        blocks.profiles=profBlock;
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
      ],renderGlobalStyles,'contrastModeSet',false));}
      if(config.features.textSpacing){reading.appendChild(makeRadioGroup(t('textSpacing'),'textSpacing',[
        {value:'normal',label:t('spacingNormal')},
        {value:'moderate',label:t('spacingModerate')},
        {value:'heavy',label:t('spacingHeavy')}
      ],renderGlobalStyles,'textSpacingSet',false));}
      if(config.features.lineHeight){reading.appendChild(makeRadioGroup(t('lineHeight'),'lineHeight',[
        {value:'normal',label:t('lineNormal')},
        {value:'relaxed',label:t('lineRelaxed')},
        {value:'loose',label:t('lineLoose')}
      ],renderGlobalStyles,'lineHeightSet',false));}
      if(config.features.textAlign){reading.appendChild(makeRadioGroup(t('textAlign'),'textAlign',[
        {value:'default',label:t('alignDefault')},
        {value:'left',label:t('alignLeft')},
        {value:'center',label:t('alignCenter')},
        {value:'justify',label:t('alignJustify')}
      ],renderGlobalStyles,'textAlignSet',false));}
      if(config.features.saturation){reading.appendChild(makeRadioGroup(t('saturation'),'saturation',[
        {value:'normal',label:t('saturationNormal')},
        {value:'low',label:t('saturationLow')},
        {value:'high',label:t('saturationHigh')},
        {value:'mono',label:t('saturationMono')}
      ],renderGlobalStyles,'saturationSet',false));}
      if(reading.children.length){
        var readBlock=document.createElement('div');
        readBlock.className='ca-assist-sec-group';
        var readHdr=document.createElement('div');
        readHdr.className='ca-assist-sec-group-header';
        readHdr.textContent=t('sectionReadingVision');
        var readBody=document.createElement('div');
        readBody.className='ca-assist-sec-group-body';
        readBody.appendChild(reading);
        readBlock.appendChild(readHdr);
        readBlock.appendChild(readBody);
        blocks.reading=readBlock;
      }

      var motion=document.createElement('div');
      motion.className='ca-assist-quick-grid';
      if(config.features.highContrast){motion.appendChild(makeTileAction(t('highContrast'),'highContrast',renderGlobalStyles));}
      if(config.features.readableFont){motion.appendChild(makeTileAction(t('readableFont'),'readableFont',renderGlobalStyles));}
      if(config.features.pauseAnimations){motion.appendChild(makeTileAction(t('pauseAnimations'),'pauseAnimations',renderGlobalStyles,t('hintPauseAnimations')));}
      if(config.features.highlightLinks){motion.appendChild(makeTileAction(t('highlightLinks'),'highlightLinks',renderGlobalStyles));}
      if(config.features.hideImages){motion.appendChild(makeTileAction(t('hideImages'),'hideImages',renderGlobalStyles));}
      if(config.features.readingGuide){motion.appendChild(makeTileAction(t('readingGuide'),'readingGuide',renderGlobalStyles));}
      if(config.features.readingMask){motion.appendChild(makeTileAction(t('readingMask'),'readingMask',renderGlobalStyles));}
      if(config.features.bigCursor){motion.appendChild(makeTileAction(t('bigCursor'),'bigCursor',renderGlobalStyles));}
      if(config.features.tooltips){motion.appendChild(makeTileAction(t('enhancedTooltips'),'enhancedTooltips',function(){syncEnhancedTooltips();},t('enhancedTooltipsHelp')));}
      if(motion.children.length){
        var motionBlock=document.createElement('div');
        motionBlock.className='ca-assist-sec-group';
        var motionHdr=document.createElement('div');
        motionHdr.className='ca-assist-sec-group-header';
        motionHdr.textContent=t('sectionMotion');
        var motionBody=document.createElement('div');
        motionBody.className='ca-assist-sec-group-body';
        motionBody.appendChild(motion);
        motionBlock.appendChild(motionHdr);
        motionBlock.appendChild(motionBody);
        blocks.motion=motionBlock;
      }

      var nav=document.createElement('div');
      nav.className='ca-assist-stack';
      if(config.features.pageStructure){
        nav.appendChild(makeCommandAction(t('jumpToHeadings'),t('navGo'),function(){jumpToSelector('h1,h2,h3,h4,h5,h6,[role="heading"]',ann('jumpHeadingsOk'),ann('jumpHeadingsNone'));track('jump_headings',{});},'cmd-jump-headings'));
        nav.appendChild(makeCommandAction(t('jumpToLinks'),t('navGo'),function(){jumpToSelector('a[href]',ann('jumpLinksOk'),ann('jumpLinksNone'));track('jump_links',{});},'cmd-jump-links'));
      }
      if(nav.children.length){
        var navBlock=document.createElement('div');
        navBlock.className='ca-assist-sec-group ca-assist-sec-group--commands';
        var navHdr=document.createElement('div');
        navHdr.className='ca-assist-sec-group-header';
        navHdr.textContent=t('sectionNavigation');
        var navBody=document.createElement('div');
        navBody.className='ca-assist-sec-group-body';
        navBody.appendChild(nav);
        navBlock.appendChild(navHdr);
        navBlock.appendChild(navBody);
        blocks.nav=navBlock;
      }

      var orderKeys=['chrome','profiles','reading','motion','nav'];
      for(var oi=0;oi<orderKeys.length;oi++){
        var bk=orderKeys[oi];
        if(blocks[bk]){panelBody.appendChild(blocks[bk]);}
      }

    if(config.features.languageSelector){
      var langRow=document.createElement('div');
      langRow.className='ca-assist-footer-lang';
      var globe=document.createElement('span');
      globe.className='ca-assist-footer-globe';
      globe.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';
      langRow.appendChild(globe);
      langRow.appendChild(makeRadioGroup(t('language'),'language',[
        {value:'en',label:'EN'},
        {value:'es',label:'ES'},
        {value:'pt-BR',label:'BR'},
        {value:'he',label:'HE'}
      ],function(){saveState();rerenderPanel();renderGlobalStyles();track('language_change',{value:state.language});},'languageSet',false));
      footerDynamic.appendChild(langRow);
    }

    var statementHref=String(config.statementUrl||'');
    var feedbackHref=String(config.feedbackUrl||'')||(config.supportEmail?'mailto:'+String(config.supportEmail):'');
    if(statementHref||feedbackHref){
      var linksRow=document.createElement('div');
      linksRow.className='ca-assist-footer-links-row';
      if(statementHref){
        var statementLink=document.createElement('a');
        statementLink.className='ca-assist-footlink';
        statementLink.href=statementHref;
        statementLink.target='_blank';
        statementLink.rel='noopener noreferrer';
        statementLink.textContent=t('statement');
        linksRow.appendChild(statementLink);
      }
      if(statementHref&&feedbackHref){
        var linkSep=document.createElement('span');
        linkSep.className='ca-assist-footer-links-sep';
        linkSep.setAttribute('aria-hidden','true');
        linkSep.textContent=' · ';
        linksRow.appendChild(linkSep);
      }
      if(feedbackHref){
        var feedbackLink=document.createElement('a');
        feedbackLink.className='ca-assist-footlink';
        feedbackLink.href=feedbackHref;
        feedbackLink.target=feedbackHref.indexOf('mailto:')===0?'_self':'_blank';
        feedbackLink.rel=feedbackHref.indexOf('mailto:')===0?'':'noopener noreferrer';
        feedbackLink.textContent=t('reportIssue');
        linksRow.appendChild(feedbackLink);
      }
      footerDynamic.appendChild(linksRow);
    }

    var footerBar=document.createElement('div');
    footerBar.className='ca-assist-footer-bar';
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
    footerBar.appendChild(reset);
    footerBar.appendChild(buildLogoBrand('footer'));
    footerDynamic.appendChild(footerBar);
    syncOversizedShellClass();
    syncPanelThemeClass();
    syncPlainPanelClass();
    try{
      var po=panel.style.display!=='none';
      if(po){syncOpenDockLayout();}
    }catch(_dock){}
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

  function resetPanelDockStyles(){
    panel.classList.remove('ca-assist-panel--dock');
    panel.classList.remove('ca-assist-panel--dock-left');
    panel.classList.remove('ca-assist-panel--edge');
    panel.style.transition='';
    panel.style.opacity='';
    panel.style.transform='';
    panel.style.top='';
    panel.style.bottom='';
    panel.style.height='';
    panel.style.maxHeight='';
    panel.style.left='';
    panel.style.right='';
  }
  function syncOpenDockLayout(){
    try{
      var pw=effectivePanelWidthPx();
      var vw=window.innerWidth||0;
      var vh=window.innerHeight||0;
      var ins=fabSafeInsets();
      var bottomInset=ins.minB;
      var tsOpen=fabSize();
      var closedSz=tsOpen;
      var miniSz=Math.max(44,Math.round(tsOpen*0.52));
      var fabGapClosed=18;
      var fabGapOpen=8;
      var topReserve=16;
      var panelOpen=false;
      try{panelOpen=panel.style.display!=='none';}catch(_po){}
      if(panelOpen&&state.oversizedUi){
        pw=Math.min(520,Math.round(pw*1.06)+32);
      }
      pw=Math.max(260,Math.min(pw,vw-8));
      resetPanelDockStyles();
      panel.style.position='fixed';
      panel.style.zIndex='2';
      panel.style.width=pw+'px';
      panel.style.maxWidth='none';
      panel.style.top='auto';
      panel.style.height='auto';
      panel.classList.add('ca-assist-panel--edge');
      if(dockOpenRight){
        panel.style.right='0';
        panel.style.left='auto';
      }else{
        panel.style.left='0';
        panel.style.right='auto';
      }
      if(panelOpen){
        try{
          trigger.style.visibility='';
          trigger.style.pointerEvents='';
          wrap.style.minWidth='';
          wrap.style.minHeight='';
          wrap.style.overflow='visible';
          wrap.style.width=miniSz+'px';
          wrap.style.height=miniSz+'px';
          trigger.style.width=miniSz+'px';
          trigger.style.height=miniSz+'px';
          trigger.style.setProperty('--ca-launcher-size',miniSz+'px');
          syncFabShellSize(shell,miniSz);
        }catch(_h){}
        var stackBottom=bottomInset+miniSz+fabGapOpen;
        panel.style.bottom=stackBottom+'px';
        panel.style.maxHeight=Math.max(260,Math.round(vh-topReserve-stackBottom-12))+'px';
        applyFabScreenCorner(dockOpenRight,miniSz);
      }else{
        try{
          trigger.style.visibility='';
          trigger.style.pointerEvents='';
          wrap.style.minWidth='';
          wrap.style.minHeight='';
          wrap.style.overflow='';
        }catch(_s){}
        clearViewportPush();
        var maxPanelH=Math.max(220,Math.round(vh-closedSz-fabGapClosed-topReserve-bottomInset));
        panel.style.maxHeight=maxPanelH+'px';
        panel.style.bottom=(closedSz+fabGapClosed+bottomInset)+'px';
        wrap.style.width=closedSz+'px';
        wrap.style.height=closedSz+'px';
        trigger.style.width=closedSz+'px';
        trigger.style.height=closedSz+'px';
        trigger.style.setProperty('--ca-launcher-size',closedSz+'px');
        syncFabShellSize(shell,closedSz);
        applyFabScreenCorner(dockOpenRight,closedSz);
      }
      syncLauncherGlyphMetrics();
    }catch(_e){}
  }
  function refitAssistChromeFromState(){
    try{
      var panelOpen=false;
      try{panelOpen=panel.style.display!=='none';}catch(_po){}
      if(panelOpen){
        syncOpenDockLayout();
        return;
      }
      var ts=fabSize();
      trigger.style.setProperty('--ca-launcher-size',ts+'px');
      trigger.style.width=ts+'px';
      trigger.style.height=ts+'px';
      syncFabShellSize(shell,ts);
      syncLauncherGlyphMetrics();
      syncOpenDockLayout();
    }catch(_rf){}
  }
  function setOpen(next){
    var isOpen=Boolean(next);
    var closeAnimMs=0;
    if(isOpen){
      armWrapMotion();
      panel.style.display='flex';
      panel.style.opacity='0';
      panel.style.transform='translateY(22px)';
      wrap.style.transition=dockMotionTransition();
      try{void wrap.offsetWidth;}catch(_e0){}
      requestAnimationFrame(function(){
        syncOpenDockLayout();
        requestAnimationFrame(function(){
          syncOpenDockLayout();
          if(shouldMinimizeMotion()){
            panel.style.opacity='1';
            panel.style.transform='none';
            disarmWrapMotion();
          }else{
            try{void panel.offsetWidth;}catch(_e3){}
            panel.style.transition=panelRevealTransition();
            panel.style.opacity='1';
            panel.style.transform='translateY(0)';
            setTimeout(function(){disarmWrapMotion();},720);
          }
        });
      });
    }else{
      closeAnimMs=shouldMinimizeMotion()?0:500;
      armWrapMotion();
      clearViewportPush();
      wrap.style.transition=dockMotionTransition();
      panel.style.transition=panelHideTransition();
      panel.style.opacity='0';
      panel.style.transform='translateY(22px)';
      var tsClose=fabSize();
      wrap.style.minWidth='';
      wrap.style.minHeight='';
      wrap.style.width=tsClose+'px';
      wrap.style.height=tsClose+'px';
      trigger.style.visibility='';
      trigger.style.pointerEvents='';
      trigger.style.width=tsClose+'px';
      trigger.style.height=tsClose+'px';
      trigger.style.setProperty('--ca-launcher-size',tsClose+'px');
      syncFabShellSize(shell,tsClose);
      syncLauncherGlyphMetrics();
      wrap.style.paddingBottom='';
      applyFabScreenCorner(dockOpenRight,tsClose);
      try{
        var lx=parseFloat(wrap.style.left)||0;
        var ly=parseFloat(wrap.style.top)||0;
        saveFabPosition(lx,ly);
      }catch(_e1){}
      setTimeout(function(){
        panel.style.display='none';
        resetPanelDockStyles();
      },closeAnimMs);
      setTimeout(function(){
        wrap.style.transition='';
        disarmWrapMotion();
      },Math.max(closeAnimMs,700));
    }
    trigger.setAttribute("aria-expanded",isOpen?"true":"false");
    if(isOpen){
      track("panel_open",{position:config.position,dockRight:dockOpenRight});
      setTimeout(function(){
        if(closeBtn&&typeof closeBtn.focus==='function'){closeBtn.focus();}
      },0);
    }else{
      track("panel_close",{});
      if(closeAnimMs>0){
        setTimeout(function(){trigger.focus();},closeAnimMs);
      }else{
        trigger.focus();
      }
    }
  }
  function onFabPointerMove(e){
    if(!launcherDrag.active||e.pointerId!==launcherDrag.pointerId)return;
    var dx=e.clientX-launcherDrag.startX;
    var dy=e.clientY-launcherDrag.startY;
    if(Math.abs(dx)>4||Math.abs(dy)>4){launcherDrag.moved=true;}
    var sz=Math.round(trigger.offsetWidth)||fabSize();
    var c=clampFab(launcherDrag.origLeft+dx,launcherDrag.origTop+dy,sz);
    applyFabFreePosition(c.left,c.top);
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
      if(panel.style.display!=='none'){syncOpenDockLayout();}
    }
  }
  trigger.addEventListener('pointerdown',function(e){
    if(panel.style.display!=='none'){return;}
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
  var fabReflowProbeTimer=null;
  function reflowFabToViewport(){
    if(panel.style.display!=='none'){
      syncOpenDockLayout();
      return;
    }
    var sz=Math.round(trigger.offsetWidth)||fabSize();
    if(!loadFabPosition()&&dockOpenRight&&config.position!=='left'){
      if(fabReflowProbeTimer)clearTimeout(fabReflowProbeTimer);
      fabReflowProbeTimer=setTimeout(function(){
        fabReflowProbeTimer=null;
        try{
          if(panel.style.display!=='none')return;
          var sz2=Math.round(trigger.offsetWidth)||fabSize();
          var rr=resolveRightDockFabRect(sz2);
          var cr=clampFab(rr.left,rr.top,sz2);
          applyFabFreePosition(cr.left,cr.top);
        }catch(_rp){}
      },100);
      return;
    }
    var lx=parseFloat(wrap.style.left)||0;
    var ly=parseFloat(wrap.style.top)||0;
    var c=clampFab(lx,ly,sz);
    if(c.left!==lx||c.top!==ly){
      applyFabFreePosition(c.left,c.top);
      saveFabPosition(c.left,c.top);
    }
  }
  window.addEventListener('resize',reflowFabToViewport,{passive:true});
  try{
    var vvFab=window.visualViewport;
    if(vvFab){
      vvFab.addEventListener('resize',reflowFabToViewport,{passive:true});
      vvFab.addEventListener('scroll',reflowFabToViewport,{passive:true});
    }
  }catch(_vvFab){}
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

  shell.appendChild(panel);
  shell.appendChild(trigger);
  body.appendChild(wrap);
  wrap.style.width=ts+'px';
  wrap.style.height=ts+'px';
  placeFabInitial();
  function refitDockIfDefault(){
    try{
      if(loadFabPosition())return;
      if(panel.style.display!=='none'&&panel.style.display!=='')return;
      if(config.position==='left'||!dockOpenRight)return;
      var szF=fabSize();
      var rrF=resolveRightDockFabRect(szF);
      var cF=clampFab(rrF.left,rrF.top,szF);
      applyFabFreePosition(cF.left,cF.top);
    }catch(_rf){}
  }
  setTimeout(refitDockIfDefault,480);
  syncWidgetMotionClass();
  syncOversizedShellClass();
  document.addEventListener('keydown',function(ev){
    try{
      if(!ev.altKey||!ev.shiftKey){return;}
      if(String(ev.key||'').toLowerCase()!=='a'){return;}
      var el=ev.target;
      var tag=el&&el.tagName;
      if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'){return;}
      try{if(el&&el.isContentEditable){return;}}catch(_ce){}
      ev.preventDefault();
      var closed=panel.style.display==='none'||panel.style.display==='';
      setOpen(closed);
    }catch(_kd){}
  },true);
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
  syncAssistShellLangDir();
  syncShellLocaleClass();
  window.__carbonA11yApplyStudioPreview=function(){
    try{
      var sp=window.__carbonA11yStudioPreview;
      if(!sp||typeof sp!=='object'){return;}
      var ch=false;
      if(typeof sp.textScale==='number'&&isFinite(sp.textScale)){var ts=Math.max(85,Math.min(150,Math.round(sp.textScale)));if(state.textScale!==ts){state.textScale=ts;ch=true;}}
      if(typeof sp.highContrast==='boolean'&&(state.highContrast!==sp.highContrast||state.contrastMode!=='none')){state.highContrast=sp.highContrast;state.contrastMode='none';ch=true;}
      if(typeof sp.readableFont==='boolean'&&state.readableFont!==sp.readableFont){state.readableFont=sp.readableFont;ch=true;}
      if(typeof sp.highlightLinks==='boolean'&&state.highlightLinks!==sp.highlightLinks){state.highlightLinks=sp.highlightLinks;ch=true;}
      if(!ch){return;}
      saveState();
      rerenderPanel();
      renderGlobalStyles();
      syncWidgetMotionClass();
    }catch(_e){}
  };
  window.__carbonA11yApplyStudioProfile=function(profileName){
    try{
      if(typeof profileName!=='string'||!profileName){return;}
      applyProfile(profileName);
    }catch(_e){}
  };
}

function primeStudioPreviewFromWindow(){
  try{
    var sp=window.__carbonA11yStudioPreview;
    if(!sp||typeof sp!=='object'){return;}
    if(typeof sp.textScale==='number'&&isFinite(sp.textScale)){state.textScale=Math.max(85,Math.min(150,Math.round(sp.textScale)));}
    if(typeof sp.highContrast==='boolean'){
      state.highContrast=sp.highContrast;
      state.contrastMode='none';
    }
    if(typeof sp.readableFont==='boolean'){state.readableFont=sp.readableFont;}
    if(typeof sp.highlightLinks==='boolean'){state.highlightLinks=sp.highlightLinks;}
  }catch(_e){}
}
hydrateState();
primeStudioPreviewFromWindow();
function bootCarbonAssistWidget(){
  createWidget();
  renderGlobalStyles();
}
if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",bootCarbonAssistWidget);}else{bootCarbonAssistWidget();}
})();`;

  return new NextResponse(js, {
    status: 200,
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "private, no-store, no-cache, must-revalidate, max-age=0",
      pragma: "no-cache",
      expires: "0",
    },
  });
}
