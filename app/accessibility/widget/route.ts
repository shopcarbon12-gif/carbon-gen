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
  language:config.language||'en'
};
var ui={};
var styleTag=document.createElement("style");
styleTag.id="carbon-a11y-style";
document.head.appendChild(styleTag);
var widgetCss='' +
'.carbon-a11y-root,.carbon-a11y-root *{font-family:Inter,"Segoe UI",Arial,sans-serif !important;letter-spacing:normal !important;text-transform:none !important;}' +
'.carbon-a11y-shell{position:relative;display:grid;}' +
'.carbon-a11y-trigger{display:inline-flex;align-items:center;gap:8px;border:0;color:#fff;padding:10px 14px;cursor:pointer;font-weight:650;font-size:16px;line-height:1;transition:transform .18s ease,box-shadow .18s ease,background .18s ease;}' +
'.carbon-a11y-trigger:hover{transform:translateY(-2px);}' +
'.carbon-a11y-trigger:focus-visible{outline:2px solid #ffffff;outline-offset:2px;}' +
'.carbon-a11y-trigger.carbon-solid{background:linear-gradient(135deg,var(--carbon-brand,#6d28d9),#5b4de2);box-shadow:0 14px 34px rgba(36,20,92,0.44);}' +
'.carbon-a11y-trigger.carbon-outline{background:rgba(9,12,22,0.78);border:2px solid color-mix(in srgb, var(--carbon-brand,#6d28d9) 78%, #ffffff 22%);}' +
'.carbon-a11y-trigger.carbon-glass{background:linear-gradient(135deg,rgba(255,255,255,.22),rgba(255,255,255,.06));border:1px solid rgba(255,255,255,0.3);backdrop-filter:blur(14px);}' +
'.carbon-a11y-panel{position:absolute;bottom:68px;max-width:calc(100vw - 24px);background:linear-gradient(180deg,#f6f8fc,#edf2fa 68%,#e9eef8);color:#111827;border:1px solid rgba(15,23,42,.14);padding:16px;border-radius:18px;box-shadow:0 24px 58px rgba(0,0,0,.32);display:none;max-height:min(80vh,720px);overflow:auto;scrollbar-width:thin;scrollbar-color:rgba(15,23,42,.3) transparent;}' +
'.carbon-a11y-panel::-webkit-scrollbar{width:9px;height:9px;}' +
'.carbon-a11y-panel::-webkit-scrollbar-thumb{background:rgba(255,255,255,.26);border-radius:999px;}' +
'.carbon-a11y-head{display:flex;align-items:center;justify-content:space-between;margin:-4px -4px 10px;padding:10px 12px;border-radius:12px;background:linear-gradient(135deg,#3458c7,#2f45aa);gap:10px;}' +
'.carbon-a11y-title{font-weight:720;font-size:18px;letter-spacing:.01em !important;color:#ffffff;margin:0;}' +
'.carbon-a11y-close{border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.14);color:#fff;border-radius:999px;width:34px;height:34px;font-size:20px;line-height:1;cursor:pointer;}' +
'.carbon-a11y-action{width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;text-align:left;border:1px solid rgba(15,23,42,.12);background:#ffffff;color:#111827;border-radius:14px;padding:11px 12px;min-height:46px;transition:background .16s ease,border-color .16s ease;}' +
'.carbon-a11y-action:hover{background:#f8fbff;border-color:rgba(15,23,42,.24);}' +
'.carbon-a11y-action-label{font-size:14px;font-weight:640;line-height:1.2;color:#111827;}' +
'.carbon-a11y-action-state{position:relative;display:inline-block;width:42px;height:24px;border-radius:999px;background:#d1d8e8;font-size:0;flex:0 0 auto;transition:background .16s ease;}' +
'.carbon-a11y-action-state::after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:999px;background:#ffffff;box-shadow:0 1px 3px rgba(0,0,0,.24);transition:transform .16s ease;}' +
'.carbon-a11y-action.is-on .carbon-a11y-action-state{background:linear-gradient(135deg,var(--carbon-brand,#6d28d9),#7c3aed);}' +
'.carbon-a11y-action.is-on .carbon-a11y-action-state::after{transform:translateX(18px);}' +
'.carbon-a11y-select-wrap{display:grid;grid-template-columns:1fr;gap:6px;margin-top:11px;}' +
'.carbon-a11y-label{font-size:12px;font-weight:620;color:#2a3a59;letter-spacing:.02em;}' +
'.carbon-a11y-select{width:100%;border:1px solid rgba(15,23,42,.16);background:#ffffff;color:#111827;border-radius:14px;padding:11px 12px;font-size:15px;outline:none;}' +
'.carbon-a11y-select:focus{border-color:rgba(67,56,202,.55);box-shadow:0 0 0 3px rgba(99,102,241,.18);}' +
'.carbon-a11y-section{margin-top:14px;font-size:11px;letter-spacing:.08em !important;opacity:.9;font-weight:700;color:#4a5f87;}' +
'.carbon-a11y-grid2{display:grid;grid-template-columns:1fr 1fr;gap:9px;}' +
'.carbon-a11y-tools-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;}' +
'.carbon-a11y-tool{border:1px solid rgba(15,23,42,.12);background:#ffffff;color:#0c1427;border-radius:14px;padding:12px 8px;min-height:96px;display:grid;place-items:center;gap:6px;cursor:pointer;position:relative;transition:transform .14s ease, box-shadow .14s ease;}' +
'.carbon-a11y-tool:hover{transform:translateY(-1px);box-shadow:0 8px 18px rgba(0,0,0,.2);}' +
'.carbon-a11y-tool-icon{width:34px;height:34px;border-radius:999px;background:#e2e8f4;color:#0f172a;display:grid;place-items:center;font-size:14px;font-weight:800;}' +
'.carbon-a11y-tool-label{font-size:14px;font-weight:700;line-height:1.2;text-align:center;color:#101a2f;}' +
'.carbon-a11y-tool-state{position:absolute;top:8px;right:8px;font-size:10px;padding:3px 7px;border-radius:999px;background:#dbe4f4;color:#0f172a;font-weight:700;letter-spacing:.05em;text-transform:uppercase !important;}' +
'.carbon-a11y-tool.is-on{background:linear-gradient(180deg,#efe7ff,#e6dcff);border-color:rgba(109,40,217,.45);}' +
'.carbon-a11y-tool.is-on .carbon-a11y-tool-state{background:#5b21b6;color:#fff;}' +
'.carbon-a11y-tool-state[data-kind="jump"]{background:#dbeafe;color:#1e3a8a;}' +
'.carbon-a11y-chip{border:1px solid rgba(15,23,42,.12);background:#ffffff;color:#111827;border-radius:14px;padding:10px 8px;font-size:14px;font-weight:620;transition:background .16s ease,border-color .16s ease;}' +
'.carbon-a11y-chip:hover{background:#f7faff;border-color:rgba(15,23,42,.22);}' +
'.carbon-a11y-reset{margin-top:12px;width:100%;border:1px solid rgba(15,23,42,.16);background:#ffffff;color:#111827;border-radius:14px;padding:11px 10px;font-size:14px;font-weight:680;}' +
'.carbon-a11y-link{display:inline-block;margin-top:10px;color:#2f45aa;text-decoration:underline;font-size:12px;opacity:.95;}' +
'.carbon-a11y-link + .carbon-a11y-link{margin-top:7px;}' +
'.carbon-a11y-profile-strip{display:flex;gap:8px;overflow:auto;padding-bottom:2px;scrollbar-width:none;}' +
'.carbon-a11y-profile-strip::-webkit-scrollbar{display:none;}' +
'.carbon-a11y-profile-pill{white-space:nowrap;border:1px solid rgba(15,23,42,.16);background:#fff;border-radius:999px;padding:8px 12px;font-size:13px;font-weight:650;color:#0f172a;cursor:pointer;}' +
'.carbon-a11y-profile-pill:hover{background:#f4f7ff;}' +
'.carbon-a11y-profile-clear{margin-top:8px;width:100%;border:1px dashed rgba(15,23,42,.25);background:#fff;border-radius:12px;padding:10px 12px;font-size:13px;font-weight:650;color:#111827;cursor:pointer;}' +
'.carbon-a11y-list{display:grid;gap:8px;margin-top:8px;}' +
'.carbon-a11y-divider{height:1px;background:rgba(15,23,42,.1);margin:8px 0 2px;}';
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
    language:'Language'
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
    language:'Idioma'
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
    language:'Idioma'
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
    language:'Hebrew Language'
  }
};

function t(key){
  var lang=i18n[state.language]?state.language:'en';
  return (i18n[lang]&&i18n[lang][key])||i18n.en[key]||key;
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
      language:state.language
    };
    localStorage.setItem(storageKey,JSON.stringify(data));
  }catch(_e){}
}

function hydrateState(){
  try{
    var raw=localStorage.getItem(storageKey);
    if(!raw){return;}
    var parsed=JSON.parse(raw);
    if(!parsed||typeof parsed!=='object'){return;}
    Object.assign(state,parsed);
    if(!i18n[state.language]){state.language=config.language||'en';}
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

function makeAction(label,key,onToggle){
  var btn=document.createElement("button");
  btn.type="button";
  btn.className='carbon-a11y-action';
  var labelNode=document.createElement('span');
  labelNode.className='carbon-a11y-action-label';
  labelNode.textContent=label;
  var stateNode=document.createElement('span');
  stateNode.className='carbon-a11y-action-state';
  btn.appendChild(labelNode);
  btn.appendChild(stateNode);
  function paint(){
    var enabled=Boolean(state[key]);
    stateNode.textContent=enabled?'On':'Off';
    if(enabled){btn.classList.add('is-on');}else{btn.classList.remove('is-on');}
  }
  paint();
  btn.addEventListener("click",function(){
    state[key]=!state[key];
    paint();
    onToggle();
    saveState();
    track("toggle_"+String(key),{enabled:state[key]});
  });
  return btn;
}

function makeCommandAction(label,badgeText,onClick){
  var btn=document.createElement('button');
  btn.type='button';
  btn.className='carbon-a11y-action';
  var labelNode=document.createElement('span');
  labelNode.className='carbon-a11y-action-label';
  labelNode.textContent=label;
  var stateNode=document.createElement('span');
  stateNode.className='carbon-a11y-action-state';
  stateNode.textContent=String(badgeText||'GO');
  btn.appendChild(labelNode);
  btn.appendChild(stateNode);
  btn.addEventListener('click',function(){onClick();});
  return btn;
}

function makeSelect(label,key,options,onToggle){
  var wrap=document.createElement('div');
  wrap.className='carbon-a11y-select-wrap';
  var text=document.createElement('label');
  text.textContent=label;
  text.className='carbon-a11y-label';
  var select=document.createElement('select');
  select.className='carbon-a11y-select';
  for(var i=0;i<options.length;i++){
    var opt=document.createElement('option');
    opt.value=String(options[i].value);
    opt.textContent=String(options[i].label);
    select.appendChild(opt);
  }
  select.value=String(state[key]||options[0].value);
  select.addEventListener('change',function(){
    state[key]=select.value;
    onToggle();
    saveState();
    track('set_'+String(key),{value:state[key]});
  });
  wrap.appendChild(text);
  wrap.appendChild(select);
  return wrap;
}

function makeSectionTitle(text){
  var node=document.createElement('div');
  node.textContent=text;
  node.className='carbon-a11y-section';
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
}

function jumpToSelector(selector){
  var nodes=document.querySelectorAll(selector);
  if(!nodes||!nodes.length){return;}
  var target=nodes[0];
  if(target&&typeof target.scrollIntoView==='function'){
    target.scrollIntoView({behavior:'smooth',block:'start'});
    if(typeof target.focus==='function'){
      try{target.setAttribute('tabindex','-1');target.focus({preventScroll:true});}catch(_e){}
    }
  }
}

function handlePointerMove(event){
  var y=event.clientY||0;
  guideLine.style.top=(y+1)+'px';
  var top=Math.max(0,y-45);
  var bottom=Math.max(0,(window.innerHeight||0)-y-45);
  readingMask.style.background='linear-gradient(to bottom, rgba(0,0,0,0.62) 0, rgba(0,0,0,0.62) '+top+'px, rgba(0,0,0,0) '+(top+1)+'px, rgba(0,0,0,0) '+(top+90)+'px, rgba(0,0,0,0.62) '+(top+91)+'px, rgba(0,0,0,0.62) calc(100% - '+bottom+'px))';
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

  var trigger=document.createElement("button");
  trigger.type="button";
  trigger.setAttribute("aria-haspopup","dialog");
  trigger.setAttribute("aria-label",config.label+" options");
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
  panel.setAttribute("role","dialog");
  panel.setAttribute("aria-modal","false");
  panel.setAttribute("tabindex","-1");
  trigger.setAttribute("aria-controls",panelId);

  var head=document.createElement('div');
  head.className='carbon-a11y-head';
  var title=document.createElement("div");
  title.id="carbon-a11y-panel-title";
  title.className='carbon-a11y-title';
  title.textContent=config.label;
  var closeBtn=document.createElement('button');
  closeBtn.type='button';
  closeBtn.className='carbon-a11y-close';
  closeBtn.setAttribute('aria-label','Close accessibility panel');
  closeBtn.textContent='×';
  closeBtn.addEventListener('click',function(){setOpen(false);});
  head.appendChild(title);
  head.appendChild(closeBtn);
  panel.setAttribute("aria-labelledby",title.id);
  panel.appendChild(head);

  function rerenderPanel(){
    while(panel.children.length>1){panel.removeChild(panel.lastChild);}

    if(config.features.languageSelector){
      panel.appendChild(makeSelect(t('language'),'language',[
        {value:'en',label:'English'},
        {value:'es',label:'Espanol'},
        {value:'pt-BR',label:'Portugues (Brasil)'},
        {value:'he',label:'Hebrew'}
      ],function(){saveState();rerenderPanel();renderGlobalStyles();track('language_change',{value:state.language});}));
    }

    if(config.features.profiles){
      panel.appendChild(makeSectionTitle(t('profiles')));
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
          b.textContent=profile.label;
          b.addEventListener('click',function(){applyProfile(profile.key);});
          profilesWrap.appendChild(b);
        })(profileDefs[p]);
      }
      panel.appendChild(profilesWrap);
      var clearProfile=document.createElement('button');
      clearProfile.type='button';
      clearProfile.className='carbon-a11y-profile-clear';
      clearProfile.textContent=t('profileClear');
      clearProfile.addEventListener('click',function(){applyProfile('clear');});
      panel.appendChild(clearProfile);
    }

    panel.appendChild(makeSectionTitle('Quick Controls'));
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
    if(quick.children.length){panel.appendChild(quick);}

    panel.appendChild(makeSectionTitle('Adjustments'));
    var adjust=document.createElement('div');
    adjust.className='carbon-a11y-list';

    if(config.features.textScale){
      adjust.appendChild(makeCommandAction('Text Larger',String(state.textScale)+'%',function(){
        state.textScale=Math.min(170,state.textScale+10);renderGlobalStyles();saveState();track('text_scale_change',{value:state.textScale});
      }));
      adjust.appendChild(makeCommandAction('Text Smaller',String(state.textScale)+'%',function(){
        state.textScale=Math.max(85,state.textScale-10);renderGlobalStyles();saveState();track('text_scale_change',{value:state.textScale});
      }));
    }
    if(config.features.contrastModes){adjust.appendChild(makeSelect(t('contrastMode'),'contrastMode',[
      {value:'none',label:t('contrastNone')},
      {value:'dark',label:t('contrastDark')},
      {value:'light',label:t('contrastLight')},
      {value:'invert',label:t('contrastInvert')},
      {value:'smart',label:t('contrastSmart')}
    ],renderGlobalStyles));}
    if(config.features.textSpacing){adjust.appendChild(makeSelect(t('textSpacing'),'textSpacing',[
      {value:'normal',label:t('spacingNormal')},
      {value:'moderate',label:t('spacingModerate')},
      {value:'heavy',label:t('spacingHeavy')}
    ],renderGlobalStyles));}
    if(config.features.lineHeight){adjust.appendChild(makeSelect(t('lineHeight'),'lineHeight',[
      {value:'normal',label:t('lineNormal')},
      {value:'relaxed',label:t('lineRelaxed')},
      {value:'loose',label:t('lineLoose')}
    ],renderGlobalStyles));}
    if(config.features.textAlign){adjust.appendChild(makeSelect(t('textAlign'),'textAlign',[
      {value:'default',label:t('alignDefault')},
      {value:'left',label:t('alignLeft')},
      {value:'center',label:t('alignCenter')},
      {value:'justify',label:t('alignJustify')}
    ],renderGlobalStyles));}
    if(config.features.saturation){adjust.appendChild(makeSelect(t('saturation'),'saturation',[
      {value:'normal',label:t('saturationNormal')},
      {value:'low',label:t('saturationLow')},
      {value:'high',label:t('saturationHigh')},
      {value:'mono',label:t('saturationMono')}
    ],renderGlobalStyles));}
    if(config.features.pageStructure){
      adjust.appendChild(makeCommandAction('Jump to Headings','JUMP',function(){jumpToSelector('h1,h2,h3,h4,h5,h6');track('jump_headings',{});}));
      adjust.appendChild(makeCommandAction('Jump to Links','JUMP',function(){jumpToSelector('a[href]');track('jump_links',{});}));
    }
    if(adjust.children.length){panel.appendChild(adjust);}

    var divider=document.createElement('div');
    divider.className='carbon-a11y-divider';
    panel.appendChild(divider);

    var reset=document.createElement("button");
    reset.type="button";
    reset.className='carbon-a11y-reset';
    reset.textContent=t('reset');
    reset.addEventListener("click",function(){
      applyProfile('clear');
      track("reset",{});
    });
    panel.appendChild(reset);

    var statementHref=config.statementUrl || "";
    var feedbackHref=config.feedbackUrl || (config.supportEmail ? "mailto:"+config.supportEmail : "");
    if(statementHref){
      var statementLink=document.createElement("a");
      statementLink.className='carbon-a11y-link';
      statementLink.href=statementHref;
      statementLink.target="_blank";
      statementLink.rel="noopener noreferrer";
      statementLink.textContent=t('statement');
      panel.appendChild(statementLink);
    }
    if(feedbackHref){
      var feedbackLink=document.createElement("a");
      feedbackLink.className='carbon-a11y-link';
      feedbackLink.href=feedbackHref;
      feedbackLink.target=feedbackHref.indexOf("mailto:")===0?"_self":"_blank";
      feedbackLink.rel=feedbackHref.indexOf("mailto:")===0?"":"noopener noreferrer";
      feedbackLink.textContent=t('reportIssue');
      panel.appendChild(feedbackLink);
    }
  }

  function setOpen(next){
    var isOpen=Boolean(next);
    panel.style.display=isOpen?"block":"none";
    trigger.setAttribute("aria-expanded",isOpen?"true":"false");
    if(isOpen){
      panel.focus();
      activateFocusTrap();
      track("panel_open",{position:config.position});
    }else{
      deactivateFocusTrap();
      trigger.focus();
      track("panel_close",{});
    }
  }
  var trapActive=false;
  function focusableElements(){
    return panel.querySelectorAll('a[href],button:not([disabled]),textarea,select,input,[tabindex]:not([tabindex="-1"])');
  }
  function trapHandler(event){
    if(!trapActive||event.key!=='Tab'){return;}
    var f=focusableElements();
    if(!f||!f.length){event.preventDefault();return;}
    var first=f[0];
    var last=f[f.length-1];
    var active=document.activeElement;
    if(event.shiftKey&&active===first){
      event.preventDefault();
      if(last&&last.focus){last.focus();}
      return;
    }
    if(!event.shiftKey&&active===last){
      event.preventDefault();
      if(first&&first.focus){first.focus();}
    }
  }
  function activateFocusTrap(){
    trapActive=true;
    document.addEventListener('keydown',trapHandler,true);
  }
  function deactivateFocusTrap(){
    trapActive=false;
    document.removeEventListener('keydown',trapHandler,true);
  }
  trigger.addEventListener("click",function(){setOpen(panel.style.display==="none");});
  panel.addEventListener("keydown",function(event){
    if(event.key==="Escape"){
      event.preventDefault();
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
      "cache-control": "public, max-age=300",
    },
  });
}
