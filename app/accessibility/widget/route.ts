import { NextResponse } from "next/server";
import { loadAccessibilityWidgetConfig } from "@/lib/accessibilityConfigRepository";

const DEFAULT_CONFIG = {
  brandColor: "#6d28d9",
  panelColor: "#111827",
  position: "right",
  cornerRadius: 14,
  label: "Accessibility",
  showTextLabel: true,
  statementUrl: "",
  feedbackUrl: "",
  supportEmail: "",
  features: {
    textScale: true,
    highContrast: true,
    readableFont: true,
    pauseAnimations: true,
    highlightLinks: true,
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
    cornerRadius:
      typeof cfg.cornerRadius === "number" && Number.isFinite(cfg.cornerRadius)
        ? Math.max(8, Math.min(24, Math.round(cfg.cornerRadius)))
        : DEFAULT_CONFIG.cornerRadius,
    label:
      (typeof cfg.label === "string" && cfg.label.trim() ? cfg.label : "") ||
      (typeof cfg.widgetLabel === "string" && cfg.widgetLabel.trim() ? cfg.widgetLabel : "") ||
      DEFAULT_CONFIG.label,
    showTextLabel:
      typeof cfg.showTextLabel === "boolean" ? cfg.showTextLabel : DEFAULT_CONFIG.showTextLabel,
    statementUrl: normalizeUrl(cfg.statementUrl, DEFAULT_CONFIG.statementUrl),
    feedbackUrl: normalizeUrl(cfg.feedbackUrl, DEFAULT_CONFIG.feedbackUrl),
    supportEmail: normalizeEmail(cfg.supportEmail, DEFAULT_CONFIG.supportEmail),
    features: {
      textScale: getFeature("textScale", DEFAULT_CONFIG.features.textScale),
      highContrast: getFeature("highContrast", DEFAULT_CONFIG.features.highContrast),
      readableFont: getFeature("readableFont", DEFAULT_CONFIG.features.readableFont),
      pauseAnimations: getFeature("pauseAnimations", DEFAULT_CONFIG.features.pauseAnimations),
      highlightLinks: getFeature("highlightLinks", DEFAULT_CONFIG.features.highlightLinks),
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
var state={textScale:100,highContrast:false,readableFont:false,pauseAnimations:false,highlightLinks:false};
var styleTag=document.createElement("style");
styleTag.id="carbon-a11y-style";
document.head.appendChild(styleTag);

function renderGlobalStyles(){
  var css=[];
  css.push(':root{font-size:'+state.textScale+'%;}');
  if(state.highContrast){css.push('html,body{background:#000 !important;color:#fff !important;}');}
  if(state.readableFont){css.push('html,body,*{font-family:"Atkinson Hyperlegible","Segoe UI",Arial,sans-serif !important;}');}
  if(state.pauseAnimations){css.push('*,*::before,*::after{animation:none !important;transition:none !important;scroll-behavior:auto !important;}');}
  if(state.highlightLinks){css.push('a{outline:2px dashed #f59e0b !important;outline-offset:2px !important;border-radius:4px;}');}
  styleTag.textContent=css.join("\\n");
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
  btn.style.width="100%";
  btn.style.textAlign="left";
  btn.style.border="1px solid rgba(255,255,255,0.2)";
  btn.style.background="rgba(255,255,255,0.08)";
  btn.style.color="#fff";
  btn.style.borderRadius="10px";
  btn.style.padding="8px 10px";
  btn.style.fontWeight="700";
  btn.style.minHeight="36px";
  function paint(){btn.textContent=label+': '+(state[key]?'ON':'OFF');}
  paint();
  btn.addEventListener("click",function(){
    state[key]=!state[key];
    paint();
    onToggle();
    track("toggle_"+String(key),{enabled:state[key]});
  });
  return btn;
}

function createWidget(){
  var wrap=document.createElement("div");
  wrap.id="carbon-a11y-widget";
  wrap.style.position="fixed";
  wrap.style.zIndex="2147483000";
  wrap.style.bottom="18px";
  wrap.style[config.position==="left"?"left":"right"]="18px";

  var trigger=document.createElement("button");
  trigger.type="button";
  trigger.setAttribute("aria-haspopup","dialog");
  trigger.setAttribute("aria-label",config.label+" options");
  trigger.setAttribute("aria-expanded","false");
  trigger.style.display="inline-flex";
  trigger.style.alignItems="center";
  trigger.style.gap="8px";
  trigger.style.border="0";
  trigger.style.color="#fff";
  trigger.style.background=config.brandColor;
  trigger.style.padding="10px 14px";
  trigger.style.cursor="pointer";
  trigger.style.fontWeight="700";
  trigger.style.borderRadius=String(config.cornerRadius)+"px";
  trigger.innerHTML=config.showTextLabel?'<span aria-hidden="true">AA</span><span>'+config.label+'</span>':'<span aria-hidden="true">AA</span>';

  var panel=document.createElement("div");
  var panelId="carbon-a11y-panel";
  panel.id=panelId;
  panel.style.display="none";
  panel.style.position="absolute";
  panel.style.bottom="60px";
  panel.style[config.position==="left"?"left":"right"]="0";
  panel.style.width="280px";
  panel.style.maxWidth="calc(100vw - 24px)";
  panel.style.background=config.panelColor;
  panel.style.color="#fff";
  panel.style.border="1px solid rgba(255,255,255,0.2)";
  panel.style.borderRadius=String(config.cornerRadius)+"px";
  panel.style.padding="12px";
  panel.style.boxShadow="0 16px 30px rgba(0,0,0,0.35)";
  panel.setAttribute("role","dialog");
  panel.setAttribute("aria-modal","false");
  panel.setAttribute("tabindex","-1");
  trigger.setAttribute("aria-controls",panelId);

  var title=document.createElement("div");
  title.id="carbon-a11y-panel-title";
  title.textContent=config.label;
  title.style.fontWeight="700";
  title.style.marginBottom="8px";
  panel.setAttribute("aria-labelledby",title.id);
  panel.appendChild(title);

  if(config.features.textScale){
    var row=document.createElement("div");
    row.style.display="grid";
    row.style.gridTemplateColumns="1fr 1fr";
    row.style.gap="8px";
    row.style.marginBottom="8px";
    var less=document.createElement("button");
    less.type="button";
    less.textContent="A-";
    less.style.borderRadius="10px";
    less.style.padding="8px";
    less.style.fontWeight="700";
    less.addEventListener("click",function(){
      state.textScale=Math.max(85,state.textScale-10);
      renderGlobalStyles();
      track("text_scale_change",{value:state.textScale});
    });
    var more=document.createElement("button");
    more.type="button";
    more.textContent="A+";
    more.style.borderRadius="10px";
    more.style.padding="8px";
    more.style.fontWeight="700";
    more.addEventListener("click",function(){
      state.textScale=Math.min(150,state.textScale+10);
      renderGlobalStyles();
      track("text_scale_change",{value:state.textScale});
    });
    row.appendChild(less);
    row.appendChild(more);
    panel.appendChild(row);
  }

  if(config.features.highContrast){panel.appendChild(makeAction("High Contrast","highContrast",renderGlobalStyles));}
  if(config.features.readableFont){panel.appendChild(makeAction("Readable Font","readableFont",renderGlobalStyles));}
  if(config.features.pauseAnimations){panel.appendChild(makeAction("Pause Animations","pauseAnimations",renderGlobalStyles));}
  if(config.features.highlightLinks){panel.appendChild(makeAction("Highlight Links","highlightLinks",renderGlobalStyles));}

  var reset=document.createElement("button");
  reset.type="button";
  reset.textContent="Reset";
  reset.style.marginTop="8px";
  reset.style.width="100%";
  reset.style.borderRadius="10px";
  reset.style.padding="8px 10px";
  reset.style.fontWeight="700";
  reset.style.border="1px solid rgba(255,255,255,0.22)";
  reset.style.background="transparent";
  reset.style.color="#fff";
  reset.addEventListener("click",function(){
    state.textScale=100;
    state.highContrast=false;
    state.readableFont=false;
    state.pauseAnimations=false;
    state.highlightLinks=false;
    renderGlobalStyles();
    track("reset",{});
  });
  panel.appendChild(reset);

  var statementHref=config.statementUrl || "";
  var feedbackHref=config.feedbackUrl || (config.supportEmail ? "mailto:"+config.supportEmail : "");
  if(statementHref){
    var statementLink=document.createElement("a");
    statementLink.href=statementHref;
    statementLink.target="_blank";
    statementLink.rel="noopener noreferrer";
    statementLink.textContent="Accessibility statement";
    statementLink.style.display="inline-block";
    statementLink.style.marginTop="8px";
    statementLink.style.color="#ffffff";
    statementLink.style.textDecoration="underline";
    panel.appendChild(statementLink);
  }
  if(feedbackHref){
    var feedbackLink=document.createElement("a");
    feedbackLink.href=feedbackHref;
    feedbackLink.target=feedbackHref.indexOf("mailto:")===0?"_self":"_blank";
    feedbackLink.rel=feedbackHref.indexOf("mailto:")===0?"":"noopener noreferrer";
    feedbackLink.textContent="Report an accessibility issue";
    feedbackLink.style.display="inline-block";
    feedbackLink.style.marginTop="6px";
    feedbackLink.style.color="#ffffff";
    feedbackLink.style.textDecoration="underline";
    panel.appendChild(feedbackLink);
  }

  function setOpen(next){
    var isOpen=Boolean(next);
    panel.style.display=isOpen?"block":"none";
    trigger.setAttribute("aria-expanded",isOpen?"true":"false");
    if(isOpen){
      panel.focus();
      track("panel_open",{position:config.position});
    }else{
      trigger.focus();
      track("panel_close",{});
    }
  }
  trigger.addEventListener("click",function(){setOpen(panel.style.display==="none");});
  panel.addEventListener("keydown",function(event){
    if(event.key==="Escape"){
      event.preventDefault();
      setOpen(false);
    }
  });
  document.addEventListener("click",function(event){
    var target=event.target;
    if(!target){return;}
    if(!wrap.contains(target)){setOpen(false);}
  });

  wrap.appendChild(trigger);
  wrap.appendChild(panel);
  body.appendChild(wrap);
}

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
