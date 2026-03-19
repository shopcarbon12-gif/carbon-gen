import { NextResponse } from "next/server";

const DEFAULT_CONFIG = {
  brandColor: "#6d28d9",
  panelColor: "#111827",
  position: "right",
  cornerRadius: 14,
  label: "Accessibility",
  showTextLabel: true,
  features: {
    textScale: true,
    highContrast: true,
    readableFont: true,
    pauseAnimations: true,
    highlightLinks: true,
  },
};

function safeParseConfig(raw: string | null) {
  if (!raw) return DEFAULT_CONFIG;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return DEFAULT_CONFIG;
    const cfg = parsed as Record<string, unknown>;
    const featuresRaw =
      cfg.features && typeof cfg.features === "object"
        ? (cfg.features as Record<string, unknown>)
        : {};
    const getFeature = (key: keyof typeof DEFAULT_CONFIG.features, fallback: boolean) =>
      typeof featuresRaw[key] === "boolean" ? Boolean(featuresRaw[key]) : fallback;
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
      label: typeof cfg.label === "string" && cfg.label.trim() ? cfg.label : DEFAULT_CONFIG.label,
      showTextLabel:
        typeof cfg.showTextLabel === "boolean" ? cfg.showTextLabel : DEFAULT_CONFIG.showTextLabel,
      features: {
        textScale: getFeature("textScale", DEFAULT_CONFIG.features.textScale),
        highContrast: getFeature("highContrast", DEFAULT_CONFIG.features.highContrast),
        readableFont: getFeature("readableFont", DEFAULT_CONFIG.features.readableFont),
        pauseAnimations: getFeature("pauseAnimations", DEFAULT_CONFIG.features.pauseAnimations),
        highlightLinks: getFeature("highlightLinks", DEFAULT_CONFIG.features.highlightLinks),
      },
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const config = safeParseConfig(searchParams.get("config"));
  const serializedConfig = JSON.stringify(config);

  const js = `(function(){if(window.__carbonA11yLoaded){return;}window.__carbonA11yLoaded=true;
var config=${serializedConfig};
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
  function paint(){btn.textContent=label+': '+(state[key]?'ON':'OFF');}
  paint();
  btn.addEventListener("click",function(){state[key]=!state[key];paint();onToggle();});
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
  trigger.setAttribute("aria-label",config.label+" options");
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

  var title=document.createElement("div");
  title.textContent=config.label;
  title.style.fontWeight="700";
  title.style.marginBottom="8px";
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
    less.addEventListener("click",function(){state.textScale=Math.max(85,state.textScale-10);renderGlobalStyles();});
    var more=document.createElement("button");
    more.type="button";
    more.textContent="A+";
    more.style.borderRadius="10px";
    more.style.padding="8px";
    more.style.fontWeight="700";
    more.addEventListener("click",function(){state.textScale=Math.min(150,state.textScale+10);renderGlobalStyles();});
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
  });
  panel.appendChild(reset);

  trigger.addEventListener("click",function(){panel.style.display=panel.style.display==="none"?"block":"none";});

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
