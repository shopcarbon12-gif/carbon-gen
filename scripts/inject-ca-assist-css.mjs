/**
 * Splices Carbon Assist shadow CSS into app/accessibility/widget/route.ts
 * Run: node scripts/inject-ca-assist-css.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const routePath = path.join(__dirname, "..", "app", "accessibility", "widget", "route.ts");

const lines = [
  `'.ca-assist-root,.ca-assist-root::before,.ca-assist-root::after,.ca-assist-root *,.ca-assist-root *::before,.ca-assist-root *::after{box-sizing:border-box;margin:0;padding:0;font-family:ui-sans-serif,system-ui,\"Segoe UI\",Roboto,\"Helvetica Neue\",Arial,sans-serif !important;font-size:13px;line-height:1.4;letter-spacing:normal !important;text-decoration:none;color:inherit;border:none;background:transparent;box-shadow:none;outline:none}'`,
  `'.ca-assist-root img{display:block;max-width:100%;height:auto;object-fit:contain}'`,
  `'.ca-assist-root button,.ca-assist-root [role=\"switch\"],.ca-assist-root [role=\"radio\"]{font:inherit;color:inherit;cursor:pointer;appearance:none;-webkit-appearance:none;border-radius:0}'`,
  `'.ca-assist-shell{position:relative;display:block;isolation:isolate}'`,
  `'.ca-assist-launcher{--ca-glow:color-mix(in srgb,var(--ca-accent,#7c3aed) 55%,transparent);position:relative;display:inline-flex;align-items:stretch;min-width:min(320px,calc(100vw - 48px));max-width:min(420px,92vw);border:1px solid rgba(255,255,255,.12);color:#e8e8ed;padding:0 12px 0 14px;cursor:pointer;font-weight:500;transition:transform .2s ease,box-shadow .2s ease,border-color .2s ease;background:linear-gradient(175deg,rgba(38,38,44,.97) 0%,rgba(14,14,16,.99) 48%,rgba(8,8,10,1) 100%);box-shadow:0 14px 44px rgba(0,0,0,.58),inset 0 1px 0 rgba(255,255,255,.09),0 2px 0 var(--ca-glow);backdrop-filter:blur(18px);border-radius:999px}'`,
  `'.ca-assist-launcher::before{content:\"\";position:absolute;inset:1px;border-radius:inherit;padding:1px;background:linear-gradient(135deg,rgba(255,255,255,.14),transparent 42%,transparent 58%,rgba(255,255,255,.05));-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none;opacity:.45}'`,
  `'.ca-assist-launcher::after{content:\"\";position:absolute;left:8%;right:8%;bottom:4px;height:1px;border-radius:999px;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--ca-accent,#a78bfa) 65%,#fff),transparent);opacity:.5;pointer-events:none}'`,
  `'.ca-assist-launcher:hover{transform:translateY(-1px);box-shadow:0 18px 50px rgba(0,0,0,.62),inset 0 1px 0 rgba(255,255,255,.1),0 2px 0 var(--ca-glow)}'`,
  `'.ca-assist-launcher:focus-visible{outline:2px solid color-mix(in srgb,var(--ca-accent,#a78bfa) 70%,#fff);outline-offset:3px}'`,
  `'.ca-assist-launcher--outline{background:rgba(16,16,20,.82);border:1px solid color-mix(in srgb,var(--ca-accent,#7c3aed) 38%,rgba(255,255,255,.22))}'`,
  `'.ca-assist-launcher--glass{background:linear-gradient(160deg,rgba(255,255,255,.1),rgba(255,255,255,.02));border:1px solid rgba(255,255,255,.18)}'`,
  `'.ca-assist-launcher__inner{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;min-height:44px}'`,
  `'.ca-assist-launcher__brand{display:flex;align-items:center;gap:10px;min-width:0;flex:1}'`,
  `'.ca-assist-launcher__caption{font-size:10px;font-weight:600;letter-spacing:.14em;text-transform:uppercase !important;color:rgba(248,250,252,.72);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px}'`,
  `'.ca-assist-launcher__glyph{flex:0 0 auto;width:32px;height:32px;border-radius:999px;display:grid;place-items:center;border:1px solid color-mix(in srgb,var(--ca-accent,#7c3aed) 32%,rgba(255,255,255,.22));background:radial-gradient(circle at 30% 25%,rgba(255,255,255,.08),rgba(0,0,0,.45));color:#e2e8f0;box-shadow:0 0 0 1px rgba(255,255,255,.05) inset,0 0 20px color-mix(in srgb,var(--ca-accent,#7c3aed) 22%,transparent)}'`,
  `'.ca-assist-launcher__glyph svg{display:block}'`,
  `'.ca-assist-markword{display:inline-flex;align-items:baseline;gap:0;letter-spacing:.14em !important;text-transform:uppercase !important;white-space:nowrap;font-size:10.5px;font-weight:600;color:#f4f4f5}'`,
  `'.ca-assist-markword--launcher{font-size:10px;letter-spacing:.16em !important}'`,
  `'.ca-assist-markword--strip{font-size:11px;letter-spacing:.18em !important}'`,
  `'.ca-assist-markword--footer{font-size:8px;letter-spacing:.12em !important;opacity:.75}'`,
  `'.ca-assist-markword__carbon{font-weight:750;color:#fafafa}'`,
  `'.ca-assist-markword__assist{font-weight:520;color:rgba(228,228,231,.55)}'`,
  `'.ca-assist-brand{display:inline-flex;align-items:center;min-width:0;max-width:100%}'`,
  `'.ca-assist-logo-img{display:block;max-width:min(200px,55vw);height:auto;object-fit:contain;filter:drop-shadow(0 1px 2px rgba(0,0,0,.5))}'`,
  `'.ca-assist-wordmark{font-weight:750;font-size:10px;letter-spacing:.2em !important;color:#f4f4f5;text-transform:uppercase !important;white-space:nowrap}'`,
  `'.ca-assist-panel{position:absolute;bottom:calc(56px + env(safe-area-inset-bottom,0px));max-width:calc(100vw - 24px);width:100%;color:#d4d4d8;border:1px solid rgba(255,255,255,.1);padding:0;border-radius:20px;display:none;max-height:min(82vh,720px);overflow:hidden;flex-direction:column;background:linear-gradient(180deg,rgba(22,22,26,.98) 0%,color-mix(in srgb,var(--ca-panel,#0c0d10) 92%,#000) 55%,#030304 100%);box-shadow:0 36px 90px rgba(0,0,0,.68),inset 0 1px 0 rgba(255,255,255,.05),0 0 0 1px rgba(255,255,255,.03)}'`,
  `'.ca-assist-panel,.ca-assist-shell .ca-assist-panel{display:flex}'`,
  `'.ca-assist-panel::-webkit-scrollbar{width:6px}'`,
  `'.ca-assist-panel-body::-webkit-scrollbar{width:6px}'`,
  `'.ca-assist-panel-body::-webkit-scrollbar-thumb{background:rgba(255,255,255,.12);border-radius:999px}'`,
  `'.ca-assist-head{flex-shrink:0;border-bottom:1px solid rgba(255,255,255,.07);background:linear-gradient(180deg,rgba(255,255,255,.05) 0%,transparent 65%),radial-gradient(100% 90% at 0% 0%,color-mix(in srgb,var(--ca-accent,#7c3aed) 14%,transparent),transparent 55%)}'`,
  `'.ca-assist-brand-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px 10px;border-bottom:1px solid rgba(255,255,255,.06)}'`,
  `'.ca-assist-brand-left{display:flex;align-items:center;min-width:0;gap:10px}'`,
  `'.ca-assist-head-titles{padding:12px 16px 16px}'`,
  `'.ca-assist-eyebrow{font-size:9px;font-weight:650;letter-spacing:.2em !important;text-transform:uppercase !important;color:rgba(212,212,216,.45);margin-bottom:6px}'`,
  `'.ca-assist-title{font-weight:580;font-size:17px;letter-spacing:-.02em !important;color:#fafafa;margin:0;line-height:1.2}'`,
  `'.ca-assist-helper{margin-top:6px;font-size:11.5px;font-weight:450;color:rgba(212,212,216,.52);line-height:1.45;max-width:42ch}'`,
  `'.ca-assist-close{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:rgba(250,250,250,.9);border-radius:10px;width:32px;height:32px;font-size:16px;line-height:1;cursor:pointer;flex:0 0 auto;transition:background .15s ease,border-color .15s ease}'`,
  `'.ca-assist-close:hover{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.2)}'`,
  `'.ca-assist-panel-body{flex:1;min-height:0;overflow:auto;padding:14px 12px 18px;display:flex;flex-direction:column;gap:16px}'`,
  `'.ca-assist-block{display:flex;flex-direction:column;gap:8px}'`,
  `'.ca-assist-block > .ca-assist-sec{margin-bottom:0}'`,
  `'.ca-assist-sheet{display:flex;flex-direction:column;gap:0;border:1px solid rgba(255,255,255,.06);border-radius:14px;background:rgba(255,255,255,.02);overflow:hidden}'`,
  `'.ca-assist-sheet > .ca-assist-sec{padding:12px 14px 0;margin:0}'`,
  `'.ca-assist-sec{font-size:9px;font-weight:650;letter-spacing:.18em !important;text-transform:uppercase !important;color:rgba(212,212,216,.38);margin:0 0 8px 2px}'`,
  `'.ca-assist-field{padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.05)}'`,
  `'.ca-assist-field:last-child{border-bottom:0}'`,
  `'.ca-assist-field__name{font-size:9.5px;font-weight:600;letter-spacing:.1em;text-transform:uppercase !important;color:rgba(212,212,216,.42);margin-bottom:8px}'`,
  `'.ca-assist-seg{display:flex;flex-wrap:wrap;gap:6px}'`,
  `'.ca-assist-seg__btn{padding:6px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.1);background:rgba(0,0,0,.28);color:rgba(244,244,245,.88);font-size:11.5px;font-weight:520;min-height:34px;cursor:pointer;transition:background .15s ease,border-color .15s ease,color .15s ease}'`,
  `'.ca-assist-seg__btn:hover{border-color:rgba(255,255,255,.18);background:rgba(255,255,255,.04)}'`,
  `'.ca-assist-seg__btn[aria-checked=\"true\"]{border-color:color-mix(in srgb,var(--ca-accent,#7c3aed) 45%,rgba(255,255,255,.25));background:rgba(255,255,255,.06);color:#fafafa;font-weight:560}'`,
  `'.ca-assist-seg__btn:focus-visible{outline:1px solid color-mix(in srgb,var(--ca-accent,#a78bfa) 55%,#fff);outline-offset:2px}'`,
  `'.ca-assist-toggle{width:100%;display:flex;align-items:flex-start;justify-content:space-between;gap:14px;text-align:left;border:0;border-bottom:1px solid rgba(255,255,255,.05);background:transparent;color:#e4e4e7;padding:11px 14px;min-height:0;cursor:pointer;transition:background .12s ease}'`,
  `'.ca-assist-toggle:last-child{border-bottom:0}'`,
  `'.ca-assist-toggle:hover{background:rgba(255,255,255,.025)}'`,
  `'.ca-assist-toggle__text{display:flex;flex-direction:column;gap:3px;align-items:flex-start;min-width:0;flex:1}'`,
  `'.ca-assist-toggle__label{font-size:13px;font-weight:520;line-height:1.25;color:rgba(244,244,245,.95)}'`,
  `'.ca-assist-toggle__hint{font-size:11px;font-weight:450;line-height:1.35;color:rgba(212,212,216,.42)}'`,
  `'.ca-assist-switch{flex:0 0 auto;padding-top:2px}'`,
  `'.ca-assist-switch__track{position:relative;display:block;width:36px;height:20px;border-radius:999px;background:rgba(255,255,255,.1);transition:background .18s ease}'`,
  `'.ca-assist-toggle.is-on .ca-assist-switch__track{background:color-mix(in srgb,var(--ca-accent,#7c3aed) 55%,rgba(255,255,255,.12))}'`,
  `'.ca-assist-switch__thumb{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:999px;background:#f8fafc;box-shadow:0 1px 4px rgba(0,0,0,.45);transition:transform .18s cubic-bezier(.2,.85,.25,1)}'`,
  `'.ca-assist-toggle.is-on .ca-assist-switch__thumb{transform:translateX(16px)}'`,
  `'.ca-assist-navrow{width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;text-align:left;border:0;border-bottom:1px solid rgba(255,255,255,.05);background:transparent;color:#e4e4e7;padding:11px 14px;min-height:44px;cursor:pointer;transition:background .12s ease}'`,
  `'.ca-assist-navrow:last-child{border-bottom:0}'`,
  `'.ca-assist-navrow:hover{background:rgba(255,255,255,.025)}'`,
  `'.ca-assist-navrow__label{font-size:13px;font-weight:520;color:rgba(244,244,245,.92)}'`,
  `'.ca-assist-navrow__right{display:flex;align-items:center;gap:8px}'`,
  `'.ca-assist-navrow__val{font-size:10px;font-weight:650;letter-spacing:.08em;color:rgba(212,212,216,.45)}'`,
  `'.ca-assist-navrow__chev{font-size:14px;color:rgba(212,212,216,.35);font-weight:300}'`,
  `'.ca-assist-step{display:flex;align-items:center;justify-content:center;gap:10px;padding:4px 0 2px}'`,
  `'.ca-assist-step__btn{width:32px;height:32px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.35);color:#fafafa;font-size:18px;line-height:1;cursor:pointer;transition:background .15s ease,border-color .15s ease}'`,
  `'.ca-assist-step__btn:hover{border-color:rgba(255,255,255,.2);background:rgba(255,255,255,.06)}'`,
  `'.ca-assist-step__val{min-width:52px;text-align:center;font-size:12.5px;font-weight:560;letter-spacing:.02em;color:rgba(244,244,245,.9)}'`,
  `'.ca-assist-profile-strip{display:flex;gap:7px;overflow:auto;padding:4px 2px 8px;scrollbar-width:none}'`,
  `'.ca-assist-profile-strip::-webkit-scrollbar{display:none}'`,
  `'.ca-assist-profile-pill{white-space:nowrap;border:1px solid rgba(255,255,255,.1);background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.02));border-radius:999px;padding:7px 12px;font-size:11px;font-weight:550;color:rgba(236,236,241,.9);cursor:pointer;transition:background .14s ease,border-color .14s ease,transform .14s ease}'`,
  `'.ca-assist-profile-pill:hover{border-color:rgba(255,255,255,.18);background:rgba(255,255,255,.08)}'`,
  `'.ca-assist-profile-clear{margin-top:4px;width:100%;border:1px dashed rgba(255,255,255,.16);background:transparent;border-radius:11px;padding:9px 11px;font-size:10.5px;font-weight:550;color:rgba(212,212,216,.55);cursor:pointer}'`,
  `'.ca-assist-profile-clear:hover{background:rgba(255,255,255,.04);color:rgba(250,250,250,.85)}'`,
  `'.ca-assist-footer{flex-shrink:0;display:flex;flex-direction:column;gap:0;border-top:1px solid rgba(255,255,255,.07);background:linear-gradient(180deg,transparent,rgba(0,0,0,.35))}'`,
  `'.ca-assist-footer-dynamic{display:flex;flex-direction:column;gap:8px;padding:12px 14px 10px}'`,
  `'.ca-assist-footer-lang{display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap}'`,
  `'.ca-assist-footer-lang .ca-assist-field{flex:1;min-width:180px;border:0;padding:0;background:transparent}'`,
  `'.ca-assist-footer-lang .ca-assist-field__name{display:none}'`,
  `'.ca-assist-footer-lang .ca-assist-seg{flex-wrap:wrap}'`,
  `'.ca-assist-footer-globe{flex:0 0 auto;display:grid;place-items:center;width:28px;height:28px;margin-top:2px;border-radius:999px;border:1px solid rgba(255,255,255,.1);background:rgba(0,0,0,.35);color:rgba(212,212,216,.55)}'`,
  `'.ca-assist-footlink{align-self:flex-start;font-size:10.5px;font-weight:500;color:rgba(196,181,253,.82);text-decoration:none;border-bottom:1px solid rgba(255,255,255,.1);padding-bottom:1px;letter-spacing:.02em}'`,
  `'.ca-assist-footlink:hover{color:#fff;border-bottom-color:rgba(255,255,255,.28)}'`,
  `'.ca-assist-footreset{align-self:flex-start;display:inline-flex;align-items:center;gap:6px;border:0;background:transparent;color:rgba(212,212,216,.55);font-size:10.5px;font-weight:550;letter-spacing:.06em;text-transform:uppercase !important;cursor:pointer;padding:2px 0;transition:color .15s ease}'`,
  `'.ca-assist-footreset:hover{color:rgba(250,250,250,.88)}'`,
  `'.ca-assist-footreset__chev{opacity:.55;font-size:12px}'`,
  `'.ca-assist-footer-brand{display:flex;align-items:center;justify-content:flex-end;padding:0 14px 14px;min-width:0}'`,
  `'.ca-assist-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}'`,
  `'.ca-assist-region{border:0;padding:0;margin:0}'`,
  `'.ca-assist-shell.ca-assist-reduce-motion .ca-assist-launcher,.ca-assist-shell.ca-assist-reduce-motion .ca-assist-launcher:hover{transition:none !important;transform:none !important}'`,
  `'.ca-assist-shell.ca-assist-reduce-motion .ca-assist-close{transition:none !important}'`,
  `'.ca-assist-shell.ca-assist-reduce-motion .ca-assist-switch__track,.ca-assist-shell.ca-assist-reduce-motion .ca-assist-switch__thumb{transition:none !important}'`,
  `'.ca-assist-shell.ca-assist-reduce-motion .ca-assist-toggle,.ca-assist-shell.ca-assist-reduce-motion .ca-assist-navrow,.ca-assist-shell.ca-assist-reduce-motion .ca-assist-seg__btn,.ca-assist-shell.ca-assist-reduce-motion .ca-assist-profile-pill,.ca-assist-shell.ca-assist-reduce-motion .ca-assist-step__btn{transition:none !important}'`,
];

const widgetCssBlock =
  "var widgetCss='' +\n" + lines.map((l) => `  ${l} +`).join("\n") + "\n  '';";

const src = fs.readFileSync(routePath, "utf8");
const start = src.indexOf("var widgetCss='' +");
const end = src.indexOf("var guideLine=document.createElement('div');");
if (start < 0 || end < 0 || end <= start) {
  console.error("Could not find widgetCss block markers");
  process.exit(1);
}
const out = src.slice(0, start) + widgetCssBlock + "\n" + src.slice(end);
fs.writeFileSync(routePath, out);
console.log("Updated widget CSS in route.ts");
