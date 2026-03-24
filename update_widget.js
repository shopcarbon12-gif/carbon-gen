const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, 'app/accessibility/widget/route.ts');
let content = fs.readFileSync(targetFile, 'utf8');

const newCss = `var widgetCss='' +
  '@font-face { font-family: "CarbonFont"; src: url("/accessibility-assets/NeuzeitGrotesk-Regular.otf") format("opentype"); }' +
  '.ca-assist-root, .ca-assist-root::before, .ca-assist-root::after, .ca-assist-root *, .ca-assist-root *::before, .ca-assist-root *::after { box-sizing: border-box; margin: 0; padding: 0; font-family: "CarbonFont", "Neuzeit Grotesk W01 Regular", system-ui, sans-serif !important; font-size: 13px; line-height: 1.4; text-decoration: none; color: inherit; border: none; background: transparent; box-shadow: none; outline: none; }' +
  '.ca-assist-root button, .ca-assist-root [role="switch"], .ca-assist-root [role="radio"] { font: inherit; color: inherit; cursor: pointer; appearance: none; -webkit-appearance: none; border-radius: 0; }' +
  '.ca-assist-shell { position: relative; display: block; isolation: isolate; }' +
  '.ca-assist-launcher { position: relative; display: inline-flex; align-items: stretch; min-width: min(320px, calc(100vw - 48px)); max-width: min(420px, 92vw); padding: 0 12px 0 14px; cursor: pointer; color: #fff; background: rgba(15, 15, 18, 0.85); box-shadow: 0 10px 30px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.1), inset 0 1px 0 rgba(255,255,255,0.05); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border-radius: 999px; transition: transform 0.2s ease, box-shadow 0.2s ease; }' +
  '.ca-assist-launcher:hover { transform: translateY(-1px); background: rgba(20, 20, 25, 0.9); box-shadow: 0 14px 40px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.15), inset 0 1px 0 rgba(255,255,255,0.1); }' +
  '.ca-assist-launcher__inner { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; min-height: 48px; }' +
  '.ca-assist-launcher__brand { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1; }' +
  '.ca-assist-launcher__glyph { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; background: rgba(255,255,255,0.05); color: #fff; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.05); }' +
  '.ca-assist-launcher__glyph svg { width: 18px; height: 18px; }' +
  '.ca-assist-markword { display: inline-flex; align-items: center; gap: 6px; letter-spacing: 0.1em !important; font-size: 14px; color: #fff; font-weight: normal; }' +
  '.ca-assist-hex { font-size: 16px; margin-right: 2px; }' +
  '.ca-assist-panel { position: absolute; bottom: calc(64px + env(safe-area-inset-bottom, 0px)); width: 100%; color: #e4e4e7; padding: 0; display: none; flex-direction: column; overflow: hidden; background: rgba(15, 15, 18, 0.95); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 40px 80px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.05); border-radius: 16px; }' +
  '.ca-assist-panel, .ca-assist-shell .ca-assist-panel { display: flex; }' +
  '.ca-assist-panel::-webkit-scrollbar { width: 4px; }' +
  '.ca-assist-panel-body::-webkit-scrollbar { width: 4px; }' +
  '.ca-assist-panel-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 999px; }' +
  '.ca-assist-head { flex-shrink: 0; padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.05); }' +
  '.ca-assist-brand-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }' +
  '.ca-assist-close { width: 28px; height: 28px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.03); color: #fff; font-size: 16px; display: grid; place-items: center; cursor: pointer; transition: all 0.15s; }' +
  '.ca-assist-close:hover { background: rgba(255,255,255,0.1); }' +
  '.ca-assist-head-titles { display: flex; flex-direction: column; gap: 4px; }' +
  '.ca-assist-title { font-size: 18px; color: #fff; letter-spacing: 0.02em !important; }' +
  '.ca-assist-panel-sub { font-size: 12px; color: rgba(255,255,255,0.5); }' +
  '.ca-assist-panel-body { flex: 1; overflow: auto; padding: 16px 16px 24px; display: flex; flex-direction: column; gap: 20px; }' +
  '.ca-assist-sec { font-size: 12px; color: #fff; margin-bottom: 12px; padding-left: 4px; }' +
  '.ca-assist-sheet { display: flex; flex-direction: column; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 12px; padding: 4px 0; }' +
  '.ca-assist-toggle { width: 100%; display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; min-height: 48px; border-bottom: 1px solid rgba(255,255,255,0.03); cursor: pointer; transition: background 0.15s; }' +
  '.ca-assist-toggle:last-child { border-bottom: none; }' +
  '.ca-assist-toggle:hover { background: rgba(255,255,255,0.02); }' +
  '.ca-assist-toggle__label { font-size: 14px; color: rgba(255,255,255,0.9); }' +
  '.ca-assist-toggle__hint { font-size: 11px; color: rgba(255,255,255,0.4); margin-top: 2px; }' +
  '.ca-assist-switch__track { position: relative; width: 36px; height: 20px; border-radius: 20px; background: rgba(255,255,255,0.15); transition: background 0.2s; }' +
  '.ca-assist-toggle.is-on .ca-assist-switch__track { background: #fff; }' +
  '.ca-assist-switch__thumb { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: transform 0.2s; }' +
  '.ca-assist-toggle.is-on .ca-assist-switch__thumb { transform: translateX(16px); background: #000; }' +
  '.ca-assist-navrow { width: 100%; display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; min-height: 48px; border-bottom: 1px solid rgba(255,255,255,0.03); cursor: pointer; }' +
  '.ca-assist-navrow:last-child { border-bottom: none; }' +
  '.ca-assist-navrow:hover { background: rgba(255,255,255,0.02); }' +
  '.ca-assist-navrow__label { font-size: 14px; color: rgba(255,255,255,0.9); }' +
  '.ca-assist-navrow__right { display: flex; align-items: center; gap: 8px; }' +
  '.ca-assist-navrow__val { font-size: 13px; color: rgba(255,255,255,0.5); }' +
  '.ca-assist-navrow__chev { font-size: 16px; color: rgba(255,255,255,0.3); }' +
  '.ca-assist-profile-strip { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 16px 12px; }' +
  '.ca-assist-profile-pill { padding: 8px 14px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.05); border-radius: 8px; color: rgba(255,255,255,0.8); font-size: 13px; cursor: pointer; transition: all 0.15s; }' +
  '.ca-assist-profile-pill:hover { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.1); color: #fff; }' +
  '.ca-assist-profile-pill.is-active { background: #fff; color: #000; font-weight: bold; }' +
  '.ca-assist-footer { padding: 16px; border-top: 1px solid rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: space-between; }' +
  '.ca-assist-footlink { font-size: 12px; color: rgba(255,255,255,0.5); }' +
  '.ca-assist-footreset { font-size: 13px; color: rgba(255,255,255,0.5); display: flex; align-items: center; gap: 6px; cursor: pointer; }' +
  '.ca-assist-footreset:hover { color: #fff; }' +
  '.ca-assist-footer-brand { opacity: 0.5; }' +
  '.ca-assist-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}' +
  '.ca-assist-step{display:flex;align-items:center;justify-content:center;gap:12px;padding:4px 0;}' +
  '.ca-assist-step__btn{width:36px;height:36px;border-radius:18px;background:rgba(255,255,255,0.05);color:#fff;font-size:20px;line-height:1;display:flex;align-items:center;justify-content:center;transition:background 0.15s;}' +
  '.ca-assist-step__btn:hover{background:rgba(255,255,255,0.1);}' +
  '.ca-assist-step__val{min-width:60px;text-align:center;font-size:14px;color:rgba(255,255,255,0.9);}' +
  '';\n`;

content = content.replace(/var widgetCss='' \+[\s\S]*?'';\n/, newCss);

// Replace buildMarkwordStack
const newMarkword = `function buildMarkwordStack(mod){
  var w=document.createElement('span');
  w.className='ca-assist-markword'+(mod?' '+mod:'');
  w.innerHTML = '<span class="ca-assist-hex">⬡</span> CARBON ASSIST';
  return w;
}\n`;
content = content.replace(/function buildMarkwordStack\([^\}]+\}\n/, newMarkword);

// Now the branding functions
const newBrands = `function buildLauncherBrand(){
  var box=document.createElement('span');
  box.className='ca-assist-launcher__cluster';
  box.appendChild(buildMarkwordStack('ca-assist-markword--launcher'));
  return box;
}
function buildHeaderBrandStrip(){
  var box=document.createElement('div');
  box.className='ca-assist-strip-cluster';
  box.appendChild(buildMarkwordStack('ca-assist-markword--strip'));
  return box;
}
function buildLogoBrand(slot){
  var wrap=document.createElement('span');
  wrap.className='ca-assist-brand';
  var ex=slot==='launcher'?'ca-assist-markword--launcher':slot==='footer'?'ca-assist-markword--footer':'ca-assist-markword--strip';
  wrap.appendChild(buildMarkwordStack(ex));
  return wrap;
}\n`;
content = content.replace(/function buildLauncherBrand\(\)[\s\S]*?return \w+;\n\}/g, '');
content = content.replace(/function buildHeaderBrandStrip\(\)[\s\S]*?return \w+;\n\}/g, '');
content = content.replace(/function buildLogoBrand\(\w+\)[\s\S]*?return \w+;\n\}/g, newBrands);

// Remove titles logic from head inside createWidget()
// In createWidget(), there's a big block building the DOM.
// We'll replace the \`head\` construction.
content = content.replace(
  "head.appendChild(brandRow);\n  head.appendChild(titles);",
  "head.appendChild(brandRow);\n  title.style.display='none';\n  var newTitle = document.createElement('div'); newTitle.className='ca-assist-title'; newTitle.textContent='Carbon Assist';\n  titles.insertBefore(newTitle, subEl);\n  head.appendChild(titles);"
);


fs.writeFileSync(targetFile, content, 'utf8');
console.log('Update complete');
