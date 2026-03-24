const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'app/accessibility/widget/route.ts');
let src = fs.readFileSync(file, 'utf8');

// ─── 1. Replace widgetCss ────────────────────────────────────────────────────
const newCss = `var widgetCss=
  /* RESET */
  '@font-face{font-family:"NeutezitGrotesk";src:url("/accessibility-assets/NeuzeitSBook.ttf") format("truetype");font-weight:normal;font-style:normal;font-display:swap;}'+
  '.ca-assist-root,.ca-assist-root::before,.ca-assist-root::after,.ca-assist-root *,.ca-assist-root *::before,.ca-assist-root *::after{box-sizing:border-box;margin:0;padding:0;font-family:"NeutezitGrotesk",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif!important;font-size:13px;line-height:1.4;text-decoration:none;color:inherit;border:none;background:transparent;box-shadow:none;outline:none;}'+
  '.ca-assist-root button,.ca-assist-root [role="switch"],.ca-assist-root [role="radio"]{font:inherit;color:inherit;cursor:pointer;appearance:none;-webkit-appearance:none;border-radius:0;}'+
  /* SHELL */
  '.ca-assist-shell{position:relative;display:block;isolation:isolate;}'+
  /* LAUNCHER — pill with ⬡ CARBON ASSIST */
  '.ca-assist-launcher{position:relative;display:inline-flex;align-items:stretch;min-width:200px;max-width:min(360px,90vw);cursor:pointer;color:#fff;background:rgba(10,6,18,0.92);box-shadow:0 8px 32px rgba(0,0,0,0.7),inset 0 0 0 1px rgba(255,255,255,0.12);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-radius:999px;transition:transform 0.18s ease,box-shadow 0.18s ease;padding:0 16px 0 12px;}'+
  '.ca-assist-launcher:hover{transform:translateY(-1px);box-shadow:0 14px 40px rgba(0,0,0,0.75),inset 0 0 0 1px rgba(255,255,255,0.2);}'+
  '.ca-assist-launcher__inner{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;min-height:48px;}'+
  '.ca-assist-launcher__brand{display:flex;align-items:center;gap:8px;min-width:0;flex:1;}'+
  '.ca-assist-markword{display:inline-flex;align-items:center;gap:7px;letter-spacing:0.09em!important;font-size:13px;color:#fff;font-weight:500;}'+
  '.ca-assist-hex{font-size:17px;line-height:1;margin-bottom:1px;}'+
  '.ca-assist-launcher__glyph{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,0.06);color:#fff;box-shadow:inset 0 0 0 1px rgba(255,255,255,0.07);}'+
  '.ca-assist-launcher__glyph svg{width:16px;height:16px;}'+
  /* PANEL */
  '.ca-assist-panel{z-index:2147483647;display:none;position:absolute;bottom:calc(62px + env(safe-area-inset-bottom,0px));width:340px;max-width:calc(100vw - 24px);color:#e8e5f0;flex-direction:column;overflow:hidden;background:rgba(8,5,14,0.97);backdrop-filter:blur(32px);-webkit-backdrop-filter:blur(32px);border:1px solid rgba(255,255,255,0.1);box-shadow:0 48px 96px rgba(0,0,0,0.9),inset 0 1px 0 rgba(255,255,255,0.06);border-radius:18px;}'+
  '.ca-assist-panel[style*="display: none"]{display:none!important;}'+
  '.ca-assist-panel::-webkit-scrollbar,.ca-assist-panel-body::-webkit-scrollbar{width:0;}'+
  /* HEAD */
  '.ca-assist-head{flex-shrink:0;padding:20px 20px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;flex-direction:column;gap:10px;position:relative;}'+
  '.ca-assist-head-brand{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;letter-spacing:0.09em;color:#fff;}'+
  '.ca-assist-head-brand .ca-assist-hex{font-size:17px;}'+
  '.ca-assist-close{position:absolute;right:16px;top:16px;width:28px;height:28px;border-radius:8px;border:1px solid rgba(255,255,255,0.1)!important;background:rgba(255,255,255,0.05)!important;color:#fff;font-size:18px;display:grid;place-items:center;cursor:pointer;transition:background 0.15s;line-height:1;}'+
  '.ca-assist-close:hover{background:rgba(255,255,255,0.12)!important;}'+
  '.ca-assist-title{font-size:19px;color:#fff;letter-spacing:-0.01em!important;font-weight:500;line-height:1.1;}'+
  '.ca-assist-helper{font-size:12px;color:rgba(255,255,255,0.45);margin-top:-4px;}'+
  /* BODY */
  '.ca-assist-panel-body{flex:1;overflow-y:auto;display:flex;flex-direction:column;}'+
  /* SECTION HEADERS */
  '.ca-assist-sec-group{display:flex;flex-direction:column;}'+
  '.ca-assist-sec-group-header{font-size:13px;font-weight:500;color:#fff;padding:14px 20px;background:rgba(255,255,255,0.022);border-bottom:1px solid rgba(255,255,255,0.04);border-top:1px solid rgba(255,255,255,0.04);display:flex;justify-content:space-between;align-items:center;letter-spacing:0.01em;}'+
  '.ca-assist-sec-group-header::after{content:"›";opacity:0.4;font-size:15px;pointer-events:none;}'+
  '.ca-assist-stack{display:flex;flex-direction:column;}'+
  /* PROFILES */
  '.ca-assist-profile-strip{display:flex;flex-wrap:wrap;gap:6px;padding:14px 20px;}'+
  '.ca-assist-profile-pill{padding:7px 14px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08)!important;border-radius:8px;color:rgba(255,255,255,0.8);font-size:12px;cursor:pointer;transition:all 0.13s;}'+
  '.ca-assist-profile-pill:hover{background:rgba(255,255,255,0.09);border-color:rgba(255,255,255,0.15)!important;color:#fff;}'+
  '.ca-assist-profile-pill.is-active{background:#fff;color:#000;font-weight:500;border-color:#fff!important;}'+
  '.ca-assist-profile-clear{margin:0 20px 14px;padding:7px 15px;background:transparent;border:1px solid rgba(255,255,255,0.18)!important;border-radius:8px;color:#fff;font-size:12px;cursor:pointer;transition:background 0.13s;align-self:flex-start;}'+
  '.ca-assist-profile-clear:hover{background:rgba(255,255,255,0.06);}'+
  /* TOGGLE ROWS */
  '.ca-assist-toggle{width:100%;display:flex;align-items:center;justify-content:space-between;padding:14px 20px;min-height:52px;border-bottom:1px solid rgba(255,255,255,0.038);cursor:pointer;transition:background 0.13s;}'+
  '.ca-assist-toggle:last-child{border-bottom:none;}'+
  '.ca-assist-toggle:hover{background:rgba(255,255,255,0.02);}'+
  '.ca-assist-toggle__lhs{display:flex;flex-direction:column;gap:3px;flex:1;min-width:0;margin-right:12px;}'+
  '.ca-assist-toggle__label{font-size:13.5px;color:rgba(255,255,255,0.92);}'+
  '.ca-assist-toggle__hint{font-size:10.5px;color:rgba(255,255,255,0.38);line-height:1.3;}'+
  /* TOGGLE SWITCH */
  '.ca-assist-switch__track{position:relative;width:40px;height:22px;border-radius:22px;background:rgba(255,255,255,0.1);transition:background 0.2s;border:1px solid rgba(255,255,255,0.06)!important;box-shadow:inset 0 1px 3px rgba(0,0,0,0.25);flex-shrink:0;}'+
  '.ca-assist-toggle.is-on .ca-assist-switch__track{background:rgba(255,255,255,0.85);border-color:rgba(255,255,255,0.3)!important;}'+
  '.ca-assist-switch__thumb{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#9ca3af;transition:transform 0.18s cubic-bezier(0.4,0,0.2,1),background 0.18s;box-shadow:0 1px 3px rgba(0,0,0,0.4);}'+
  '.ca-assist-toggle.is-on .ca-assist-switch__thumb{transform:translateX(18px);background:#111;}'+
  /* NAV ROWS */
  '.ca-assist-navrow{width:100%;display:flex;align-items:center;justify-content:space-between;padding:14px 20px;min-height:52px;border-bottom:1px solid rgba(255,255,255,0.038);cursor:pointer;}'+
  '.ca-assist-navrow:last-child{border-bottom:none;}'+
  '.ca-assist-navrow:hover{background:rgba(255,255,255,0.02);}'+
  '.ca-assist-navrow__label{font-size:13.5px;color:rgba(255,255,255,0.92);}'+
  '.ca-assist-navrow__right{display:flex;align-items:center;gap:10px;}'+
  '.ca-assist-navrow__val{font-size:13px;color:rgba(255,255,255,0.45);}'+
  '.ca-assist-navrow__chev{font-size:16px;color:rgba(255,255,255,0.28);}'+
  /* STEPPERS */
  '.ca-assist-step{display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07)!important;border-radius:99px;padding:3px;}'+
  '.ca-assist-step__btn{width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,0.06);color:#fff;font-size:17px;line-height:1;display:flex;align-items:center;justify-content:center;transition:background 0.13s;flex-shrink:0;}'+
  '.ca-assist-step__btn:hover{background:rgba(255,255,255,0.14);}'+
  '.ca-assist-step__val{min-width:44px;text-align:center;font-size:12px;color:#fff;font-weight:500;}'+
  /* FOOTER */
  '.ca-assist-footer{padding:16px 20px;display:flex;flex-direction:column;gap:12px;background:rgba(0,0,0,0.18);border-top:1px solid rgba(255,255,255,0.05);}'+
  '.ca-assist-footer-dynamic{display:flex;flex-direction:column;gap:10px;}'+
  '.ca-assist-footreset{display:none;}'+
  '.ca-assist-custom-reset-btn{width:100%;padding:13px 20px;display:flex;justify-content:space-between;align-items:center;color:rgba(255,255,255,0.85);background:rgba(255,255,255,0.02);border-top:1px solid rgba(255,255,255,0.04)!important;border-bottom:1px solid rgba(255,255,255,0.04)!important;font-size:13.5px;cursor:pointer;}'+
  '.ca-assist-custom-reset-btn::after{content:"›";opacity:0.4;font-size:15px;}'+
  '.ca-assist-footer-lang{display:flex;align-items:center;gap:8px;}'+
  '.ca-assist-footer-globe{color:rgba(255,255,255,0.4);}'+
  '.ca-assist-footlink{font-size:13px;color:rgba(255,255,255,0.5);text-align:center;}'+
  '.ca-assist-footlink:hover{color:#fff;}'+
  '.ca-assist-footer-brand{display:flex;justify-content:center;margin-top:4px;}'+
  '.ca-assist-footer-brand .ca-assist-brand{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1)!important;padding:9px 22px;border-radius:99px;display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:600;letter-spacing:0.08em;color:#fff;}'+
  '.ca-assist-footer-brand .ca-assist-brand .ca-assist-hex{font-size:15px;}'+
  /* UTIL */
  '.ca-assist-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;}'+
  '.ca-assist-panel-sub{font-size:12px;color:rgba(255,255,255,0.45);display:none;}'+
  '';\n`;

// Find and replace the widgetCss block
const cssStart = src.indexOf('var widgetCss=');
const cssEnd = src.indexOf("'';\n", cssStart) + "'';\n".length;
if (cssStart === -1 || cssEnd <= cssStart) {
  console.error('Could not find widgetCss block. Start:', cssStart, 'End:', cssEnd);
  process.exit(1);
}
src = src.slice(0, cssStart) + newCss + src.slice(cssEnd);

// ─── 2. Replace createWidget head block ───────────────────────────────────────
// Find the head construction block
const headSearchOld = `var head=document.createElement('div');
  head.className='ca-assist-head';
  var closeBtn=document.createElement('button');
  closeBtn.type='button';
  closeBtn.id='ca-assist-close';
  closeBtn.className='ca-assist-close';
  closeBtn.setAttribute('data-carbon-key','close');
  closeBtn.setAttribute('aria-label',t('closePanel'));
  closeBtn.textContent='×';
  closeBtn.addEventListener('click',function(){setOpen(false);});
  
  var topBrandGroup = document.createElement('div');
  topBrandGroup.className = 'ca-assist-brand-header';
  var topLogo = document.createElement('img');
  topLogo.src = 'https://cdn.shopify.com/s/files/1/0680/6572/2620/files/Carbon_stacked_white.eps?v=1774083466';
  topLogo.className = 'ca-assist-logo-img';
  topLogo.alt = 'Carbon';
  topBrandGroup.appendChild(topLogo);
  
  var title=document.createElement('div');
  title.id='ca-assist-panel-title';
  title.className='ca-assist-title';
  title.textContent='Carbon Assist';
  
  var hel=document.createElement('div');
  hel.id='ca-assist-panel-desc';
  hel.className='ca-assist-helper';
  hel.textContent='Accessibility Preferences';
  
  var texts = document.createElement('div');
  texts.className = 'ca-assist-head-titles';
  texts.appendChild(title);
  texts.appendChild(hel);
  
  head.appendChild(closeBtn);
  head.appendChild(topBrandGroup);
  head.appendChild(texts);
  
  panel.setAttribute('aria-labelledby',title.id);
  panel.setAttribute('aria-describedby',hel.id);
  panel.appendChild(head);`;

const headNew = `var head=document.createElement('div');
  head.className='ca-assist-head';
  // Close button
  var closeBtn=document.createElement('button');
  closeBtn.type='button';
  closeBtn.id='ca-assist-close';
  closeBtn.className='ca-assist-close';
  closeBtn.setAttribute('data-carbon-key','close');
  closeBtn.setAttribute('aria-label',t('closePanel'));
  closeBtn.textContent='\\u00D7';
  closeBtn.addEventListener('click',function(){setOpen(false);});
  // Brand row: ⬡ CARBON ASSIST
  var headBrand=document.createElement('div');
  headBrand.className='ca-assist-head-brand';
  var hexSpan=document.createElement('span');
  hexSpan.className='ca-assist-hex';
  hexSpan.textContent='\\u2B21';
  var brandText=document.createElement('span');
  brandText.textContent='CARBON ASSIST';
  headBrand.appendChild(hexSpan);
  headBrand.appendChild(brandText);
  // Title
  var title=document.createElement('div');
  title.id='ca-assist-panel-title';
  title.className='ca-assist-title';
  title.textContent='Carbon Assist';
  // Subtitle
  var hel=document.createElement('div');
  hel.id='ca-assist-panel-desc';
  hel.className='ca-assist-helper';
  hel.textContent=t('panelSubtitle');
  // Compose
  head.appendChild(closeBtn);
  head.appendChild(headBrand);
  head.appendChild(title);
  head.appendChild(hel);
  panel.setAttribute('aria-labelledby',title.id);
  panel.setAttribute('aria-describedby',hel.id);
  panel.appendChild(head);`;

if (src.includes(headSearchOld)) {
  src = src.replace(headSearchOld, headNew);
  console.log('Head block replaced successfully');
} else {
  console.log('Head block not found by exact match, trying fallback...');
  // Fallback: find by key markers
  const fallbackStart = src.indexOf("var head=document.createElement('div');\n  head.className='ca-assist-head';");
  const fallbackEnd = src.indexOf("panel.appendChild(head);", fallbackStart) + "panel.appendChild(head);".length;
  if (fallbackStart !== -1 && fallbackEnd > fallbackStart) {
    src = src.slice(0, fallbackStart) + headNew + src.slice(fallbackEnd);
    console.log('Head block replaced via fallback');
  } else {
    console.error('Could not find head block to replace');
  }
}

// ─── 3. Fix footer brand: replace img with styled text ────────────────────────
// Replace buildLogoBrand in footer with inline brand text
const oldFootBrand = `footBrand.appendChild(buildLogoBrand('footer'));`;
const newFootBrand = `// Build footer brand pill: ⬡ CARBON ASSIST
  var brandPill=document.createElement('span');
  brandPill.className='ca-assist-brand';
  var bHex=document.createElement('span');
  bHex.className='ca-assist-hex';
  bHex.textContent='\\u2B21';
  var bTxt=document.createElement('span');
  bTxt.textContent='CARBON ASSIST';
  brandPill.appendChild(bHex);
  brandPill.appendChild(bTxt);
  footBrand.appendChild(brandPill);`;

if (src.includes(oldFootBrand)) {
  src = src.replace(oldFootBrand, newFootBrand);
  console.log('Footer brand replaced');
} else {
  console.log('Footer brand line not found, skipping');
}

// ─── 4. Fix launcher brand — ensure it renders ⬡ CARBON ASSIST ───────────────
// buildLauncherBrand function — replace its internals
const oldLauncherBrand = `function buildLauncherBrand(){`;
const launcherBrandIdx = src.indexOf(oldLauncherBrand);
if (launcherBrandIdx !== -1) {
  const launcherFnEnd = src.indexOf('\n}', launcherBrandIdx) + '\n}'.length;
  const newLauncherBrand = `function buildLauncherBrand(){
  var frag=document.createDocumentFragment();
  var mw=document.createElement('span');
  mw.className='ca-assist-markword';
  var h=document.createElement('span');
  h.className='ca-assist-hex';
  h.setAttribute('aria-hidden','true');
  h.textContent='\\u2B21';
  var t2=document.createElement('span');
  t2.textContent='CARBON ASSIST';
  mw.appendChild(h);
  mw.appendChild(t2);
  frag.appendChild(mw);
  return frag;
}`;
  src = src.slice(0, launcherBrandIdx) + newLauncherBrand + src.slice(launcherFnEnd);
  console.log('Launcher brand function replaced');
} else {
  console.log('buildLauncherBrand not found');
}

fs.writeFileSync(file, src, 'utf8');
console.log('Widget route.ts updated. Total length:', src.length);
