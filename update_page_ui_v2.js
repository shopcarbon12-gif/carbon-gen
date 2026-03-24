const fs = require('fs');
const path = require('path');

// 1. Rewrite CSS
const cssPath = path.join(__dirname, 'app/accessibility/page.module.css');
const cssContent = `
@font-face {
  font-family: 'CarbonFont';
  src: url('/accessibility-assets/NeuzeitGrotesk-Regular.otf') format('opentype');
}

.page {
  font-family: 'CarbonFont', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  min-height: 100vh;
  /* Complex gradient mesh exact to mockup */
  background-color: #0b0510;
  background-image: 
    radial-gradient(circle at 0% 30%, rgba(200, 100, 40, 0.25) 0%, transparent 40%),
    radial-gradient(circle at 50% 0%, rgba(140, 30, 200, 0.2) 0%, transparent 50%),
    radial-gradient(circle at 100% 70%, rgba(90, 20, 160, 0.15) 0%, transparent 60%);
  background-attachment: fixed;
  color: #ededed;
  padding: 40px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.page :global(h1),
.page :global(h2),
.page :global(h3),
.page :global(p) {
  margin: 0;
}

/* HEADER */
.headerTop {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 18px;
  letter-spacing: 0.1em;
  color: #fff;
  margin-bottom: 24px;
}
.headerTopLogo {
  display: flex;
  align-items: center;
  gap: 8px;
}

.hero {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.heroTitle {
  font-size: 36px;
  font-weight: 500;
  letter-spacing: -0.01em;
  color: #ffffff;
}

.heroSub {
  font-size: 15px;
  color: rgba(255, 255, 255, 0.6);
  letter-spacing: 0.01em;
}

/* TAB BAR */
.tabBar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
}

.tabsContainer {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 99px;
  padding: 4px;
}

.tab {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
  padding: 8px 16px;
  border-radius: 99px;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.2s;
}

.tab:hover {
  color: rgba(255, 255, 255, 0.8);
}

.tabActive {
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}

.publishBtn {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 99px;
  color: #fff;
  padding: 10px 20px;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.2s;
}
.publishBtn:hover {
  background: rgba(255, 255, 255, 0.05);
}

/* SUCCESS BANNER */
.successBanner {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 16px 20px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.8);
  display: flex;
  align-items: center;
  gap: 12px;
}
.checkboxMock {
  width: 18px;
  height: 18px;
  background: #d4a373; /* Gold-ish */
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #000;
  font-size: 12px;
  font-weight: bold;
}

/* LAYOUT */
.layout {
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: 24px;
  align-items: start;
}

.mainCol {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* PANELS */
.glassPanel {
  background: rgba(20, 15, 30, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 20px;
  backdrop-filter: blur(40px);
  -webkit-backdrop-filter: blur(40px);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.panelHeader {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.panelTitle {
  font-size: 22px;
  font-weight: 500;
  color: #fff;
}

/* INNER BRAND ROW */
.brandRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.04);
  padding: 20px;
  border-radius: 12px;
}

.brandLeft {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 16px;
  letter-spacing: 0.1em;
  color: #fff;
  text-transform: uppercase;
}

.hexGlyph {
  font-size: 20px;
}

.activeDot {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #fff;
}
.activeDot::before {
  content: "";
  width: 8px;
  height: 8px;
  background-color: #10b981; /* bright green */
  border-radius: 50%;
  box-shadow: 0 0 10px rgba(16, 185, 129, 0.5);
}

/* PROFILES */
.profileSection {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.profileLabel {
  font-size: 15px;
  color: #fff;
}

.profileStrip {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.profilePill {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.2);
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.9);
}

.profilePillAdd {
  background: transparent;
  border: 1px solid transparent;
  padding: 10px 20px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  font-family: inherit;
}
.profilePillAdd:hover {
  color: #fff;
}

/* WIDGET PREVIEW AREA */
.widgetPreviewCard {
  background: url('/accessibility-assets/media__1774144485697.jpg') center/cover no-repeat, linear-gradient(135deg, rgba(80, 30, 150, 0.5), rgba(200, 80, 50, 0.2));
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 24px;
  display: flex;
  gap: 24px;
  position: relative;
  overflow: hidden;
}

.wpActualCard {
  width: 300px;
  background: rgba(15, 10, 20, 0.85);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-shadow: 0 20px 40px rgba(0,0,0,0.5);
}

.wpHead {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.wpBrand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  letter-spacing: 0.1em;
  color: #fff;
}

.wpClose {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  width: 28px;
  height: 28px;
  border-radius: 8px;
  color: #fff;
  cursor: pointer;
  display: grid;
  place-items: center;
}

.wpEyebrow {
  font-size: 14px;
  color: #fff;
  margin-bottom: 4px;
}
.wpSubtitle {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  margin-bottom: 12px;
  line-height: 1.4;
}
.wpProfiles {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.wpProfilePill {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.8);
}

.wpRightActions {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: flex-end;
  flex: 1;
}

.wpActionGroup {
  display: flex;
  gap: 8px;
}

.wpActionBtn {
  background: rgba(15, 10, 20, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  color: #fff;
  padding: 10px 16px;
  border-radius: 99px;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
  display: flex;
  align-items: center;
  gap: 6px;
}
.wpActionBtn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.actionRow {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}

.outlineBtn {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #fff;
  padding: 10px 20px;
  border-radius: 99px;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: background 0.2s;
}
.outlineBtn:hover {
  background: rgba(255, 255, 255, 0.05);
}

/* SNIPPETS */
.snippetSection {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.subLabel {
  font-size: 14px;
  color: #fff;
  margin-bottom: 8px;
  display: block;
}
.snippetBox {
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 16px;
  font-family: monospace;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}
.snippetBox code {
  overflow-x: auto;
  white-space: nowrap;
}
.snippetCopy {
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: #fff;
  padding: 6px 14px;
  border-radius: 6px;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
}

/* RIGHT RAIL COMPONENTS */
.railCard {
  background: rgba(20, 15, 30, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 20px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  backdrop-filter: blur(40px);
}

.railCardHeader {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  font-weight: 500;
  color: #fff;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.railItemRow {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.04);
  padding: 14px 16px;
  border-radius: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  color: #fff;
}
.railStatusDot {
  display: flex;
  align-items: center;
  gap: 6px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 12px;
}

.chatGptCard {
  background: linear-gradient(180deg, rgba(80, 20, 160, 0.8) 0%, rgba(40, 10, 80, 0.6) 100%);
  border: 1px solid rgba(160, 90, 255, 0.3);
  box-shadow: 0 10px 40px rgba(160, 90, 255, 0.15);
}

.chatWindow {
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  height: 200px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  color: rgba(255, 255, 255, 0.6);
  font-size: 13px;
}

/* COMPLIANCE CHECKLIST PROGRESS */
.progressWrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.progressLabel {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}
.progressBar {
  height: 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  overflow: hidden;
}
.progressFill {
  height: 100%;
  background: linear-gradient(90deg, #9333ea, #d8b4fe);
}

.statsRow {
  display: flex;
  align-items: center;
  gap: 12px;
}
.statBig {
  font-size: 28px;
  color: #fff;
}
.statSmall {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.5);
}
.statsSubtext {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

/* LAW WATCH */
.lawWatchDesc {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  line-height: 1.5;
}

.lawWatchStatusBox {
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.lawWatchStatusLabel {
  font-size: 12px;
  color: #fff;
}
`;

fs.writeFileSync(cssPath, cssContent, 'utf8');

// 2. Rewrite JSX
const tsxPath = path.join(__dirname, 'app/accessibility/page.tsx');
let tsxContent = fs.readFileSync(tsxPath, 'utf8');

const anchor = '  return (';
const idx = tsxContent.indexOf(anchor);

if (idx === -1) {
  console.error("COULD NOT FIND ANCHOR IN PAGE.TSX");
  process.exit(1);
}

const headerPart = tsxContent.substring(0, idx);

const newJsx = \`  return (
    <main className={styles.page}>
      
      <div className={styles.headerTop}>
         <div className={styles.headerTopLogo}>
           <span className={styles.hexGlyph}>⬡</span>
           <span style={{fontWeight: 600}}>CARBON</span>
           <span style={{opacity: 0.5, margin: '0 8px'}}>/</span>
           <span>ACCESSIBILITY</span>
         </div>
      </div>

      <header className={styles.hero}>
        <h1 className={styles.heroTitle}>Accessibility</h1>
        <p className={styles.heroSub}>Manage the accessibility assistant and site compliance status.</p>
      </header>
      
      <nav className={styles.tabBar}>
        <div className={styles.tabsContainer}>
          <button className={styles.tab}>Docs</button>
          <button className={styles.tab}>Tickets</button>
          <button className={styles.tab}>Log History</button>
          <button className={\`\${styles.tab} \${styles.tabActive}\`}>Widget</button>
        </div>
        <button className={styles.publishBtn} onClick={saveSettings} disabled={settingsSaving || !canSaveSettings}>
          {settingsSaving ? "Saving..." : "Publish Changes ›"}
        </button>
      </nav>

      {settings.complianceChecklist.monthlyRetestDone && (
         <div className={styles.successBanner}>
           <div className={styles.checkboxMock}>✓</div>
           Monthly retest and evidence log completed
         </div>
      )}

      <div className={styles.layout}>
         <div className={styles.mainCol}>
            
            <section className={styles.glassPanel}>
               <div className={styles.panelHeader}>
                 <h2 className={styles.panelTitle}>Accessibility</h2>
                 <div style={{color:'rgba(255,255,255,0.5)', fontSize: '14px'}}>
                    Crees Festens ⌄
                 </div>
               </div>
               
               <div className={styles.brandRow}>
                 <div className={styles.brandLeft}>
                   <span className={styles.hexGlyph}>⬡</span>
                   CARBON ASSIST
                 </div>
                 <div className={styles.activeDot}>Active</div>
               </div>
               
               <div className={styles.profileSection}>
                 <span className={styles.profileLabel}>Accessibility preferences</span>
                 <div className={styles.profileStrip}>
                   <span className={styles.profilePill}>Retail</span>
                   <span className={styles.profilePill}>Low Vision</span>
                   <span className={styles.profilePill}>Motor</span>
                   <span className={styles.profilePill}>Dyslexia</span>
                   <span className={styles.profilePill}>ADHD</span>
                   <button className={styles.profilePillAdd}>New ›</button>
                 </div>
               </div>

               <div className={styles.widgetPreviewCard}>
                  <div className={styles.wpActualCard}>
                    <div className={styles.wpHead}>
                      <div className={styles.wpBrand}><span className={styles.hexGlyph}>⬡</span> CARBON ASSIST</div>
                      <button className={styles.wpClose} onClick={removeRuntimeWidgetFromPage}>×</button>
                    </div>
                    <div>
                        <div className={styles.wpEyebrow}>Accessibility preferences</div>
                        <div className={styles.wpSubtitle}>Tune display, motion, and navigation for this site.</div>
                        <div className={styles.wpProfiles}>
                          <span className={styles.wpProfilePill}>Blind</span>
                          <span className={styles.wpProfilePill}>Low Vision</span>
                          <span className={styles.wpProfilePill}>Motor</span>
                          <span className={styles.wpProfilePill}>Dyslexia</span>
                          <span className={styles.wpProfilePill}>ADHD</span>
                          <span className={styles.wpProfilePill}>Seizure Safe</span>
                        </div>
                    </div>
                  </div>
                  <div className={styles.wpRightActions}>
                      <div className={styles.wpActionGroup}>
                         <button className={styles.wpActionBtn} onClick={installRuntimeWidgetOnPage}>
                            {runtimeWidgetMounted ? "Reload Preview ›" : "Open Preview ›"}
                         </button>
                         <button className={styles.wpActionBtn} onClick={() => setPreviewOpen(!previewOpen)}>
                            ↺
                         </button>
                         <button className={styles.wpActionBtn} onClick={() => setPreviewOpen(!previewOpen)}>
                            View ↓
                         </button>
                      </div>
                      <div className={styles.wpActionGroup}>
                         <button className={styles.wpActionBtn}>Installation Snippets ▾</button>
                         <button className={styles.wpActionBtn} onClick={() => { removeRuntimeWidgetFromPage(); setRuntimeWidgetMounted(false); }}>Uninstall</button>
                      </div>
                  </div>
               </div>

               <div className={styles.actionRow}>
                 <button className={styles.outlineBtn} onClick={installRuntimeWidgetOnPage}>Open Preview</button>
                 <button className={styles.outlineBtn} onClick={() => setPreviewOpen(!previewOpen)}>View ›</button>
                 <button className={styles.outlineBtn} onClick={() => document.getElementById("snippets")?.scrollIntoView({behavior: "smooth"})}>↺ Installation Snippets ▾</button>
               </div>
            </section>

            <section id="snippets" className={styles.glassPanel}>
               <div className={styles.panelHeader}>
                 <h2 className={styles.panelTitle}>Installation Snippets</h2>
                 <button className={styles.outlineBtn} onClick={copySnippet} style={{padding:'6px 16px'}}>
                   {copied ? "Copied!" : "↺ Refresh"}
                 </button>
               </div>
               
               <div className={styles.snippetSection}>
                 <div>
                   <span className={styles.subLabel}>Site Snippet</span>
                   <div className={styles.snippetBox}>
                     <code>{installSnippet ? installSnippet.slice(0, 70) + '...' : '<script src="https://example.com/accessibility.js"></script>'}</code>
                     <button className={styles.snippetCopy} onClick={copySnippet}>{copied ? 'Copied' : 'Copy'}</button>
                   </div>
                 </div>
                 
                 <div>
                   <span className={styles.subLabel}>App Snippet</span>
                   <div className={styles.snippetBox}>
                     <code>const carbonAssist = require("carbon-assist");</code>
                     <button className={styles.snippetCopy}>Copy</button>
                   </div>
                 </div>
               </div>
               
               <button className={styles.outlineBtn} style={{alignSelf: 'flex-start'}}>Check Installation</button>
            </section>

            <section className={styles.glassPanel}>
               <div className={styles.panelHeader}>
                 <h2 className={styles.panelTitle}>Law Watch Status</h2>
                 <button className={styles.outlineBtn} onClick={runLawWatchNow} style={{padding: '6px 16px'}}>↺ Reset</button>
               </div>
               <p className={styles.lawWatchDesc}>Daily automated checks for accessibility law/regulation source updates (ADA.gov, Federal regulators, etc.)</p>
               <div className={styles.actionRow}>
                 <button className={styles.outlineBtn} onClick={runLawWatchNow} disabled={lawWatchRunning}>{lawWatchRunning ? "Refreshing..." : "Refresh Status"}</button>
                 <button className={styles.outlineBtn} style={{width:'48px'}}>✓</button>
                 <button className={styles.outlineBtn} onClick={runLawWatchNow}>Run Law watch now</button>
               </div>
               {lawWatchStatus && <p className={styles.lawWatchDesc}>{lawWatchStatus}</p>}
            </section>
         </div>

         {/* SIDEBAR RIGHT RAIL */}
         <div className={styles.mainCol}>
            <section className={styles.railCard}>
               <div className={styles.railCardHeader}>
                 API STATUS
                 <button className={styles.wpClose}>×</button>
               </div>
               <div className={styles.railItemRow}>
                 <span>Shopify</span>
                 <span className={styles.railStatusDot}><span style={{color:'#10b981'}}>●</span> Active</span>
               </div>
               <div className={styles.railItemRow}>
                 <span>Lightspeed API</span>
                 <span className={styles.railStatusDot}><span style={{color:'#10b981'}}>●</span> Active</span>
               </div>
               <div className={styles.railItemRow}>
                 <span>Dropbox</span>
                 <span className={styles.railStatusDot}><span style={{color:'#10b981'}}>●</span> Active</span>
               </div>
            </section>

            <section className={\`\${styles.railCard} \${styles.chatGptCard}\`}>
               <div className={styles.railCardHeader} style={{textTransform:'none', fontSize:'16px'}}>
                 <span style={{display:'flex', alignItems:'center', gap:'8px'}}><span className={styles.hexGlyph}>⬡</span> ChatGPT</span>
                 <span>↺</span>
               </div>
               <div className={styles.lawWatchDesc}>Ask anything.</div>
               <div className={styles.chatWindow}>
                 No chat messages.
               </div>
               <div className={styles.railItemRow} style={{background: 'rgba(0,0,0,0.2)'}}>
                 <span style={{color: 'rgba(255,255,255,0.4)'}}>Message ChatGPT...</span>
                 <span>›</span>
               </div>
               <div className={styles.actionRow}>
                 <button className={styles.outlineBtn} style={{flex:1, background:'rgba(255,255,255,0.8)', color:'#000'}}>Send</button>
                 <button className={styles.outlineBtn} style={{flex:1}}>Clear</button>
               </div>
            </section>

            <section className={styles.railCard}>
               <div className={styles.railCardHeader} style={{textTransform:'none', fontSize:'16px'}}>
                 <span style={{display:'flex',alignItems:'center',gap:'8px'}}>🌐 Compliance Checklist</span>
               </div>
               <div className={styles.progressWrap}>
                 <span className={styles.progressLabel}>Remediation progress</span>
                 <div className={styles.progressBar}><div className={styles.progressFill} style={{width: \`\${checklistCompletion.percent}%\`}}></div></div>
               </div>
               <div className={styles.statsRow}>
                 <span className={styles.statBig}>{String(checklistCompletion.done).padStart(2,'0')} / {checklistCompletion.total}</span>
                 <span className={styles.statSmall}>({checklistCompletion.percent}%)</span>
               </div>
               <div style={{display:'flex',flexDirection:'column',gap:'16px'}}>
                 <div className={styles.statsRow}>
                   <span className={styles.statBig}>1:38s</span>
                   <span className={styles.statsSubtext}>Avg. Automation Times</span>
                 </div>
                 <div className={styles.statsRow}>
                   <span className={styles.statBig}>3.6%</span>
                   <span className={styles.statsSubtext}>Assist Clickthrough Rate</span>
                 </div>
               </div>
               <button className={styles.outlineBtn} style={{marginTop:'8px'}}>View Log History ⓘ</button>
            </section>
            
            <section className={styles.railCard}>
               <div className={styles.railCardHeader} style={{textTransform:'none', fontSize:'16px'}}>
                 <span style={{display:'flex',alignItems:'center',gap:'8px'}}>⏱ Law Watch Status</span>
               </div>
               <div className={styles.lawWatchDesc}>Daily automated checks for accessibility law updates (ADA.gov, Federal regs, Florida statues).</div>
               <div className={styles.lawWatchStatusBox}>
                 <span className={styles.lawWatchStatusLabel}>Current Compliance:</span>
                 <span className={styles.railStatusDot}><span style={{color:'#10b981'}}>●</span> active/ok</span>
               </div>
               <div className={styles.actionRow}>
                 <button className={styles.outlineBtn} style={{flex:1}}>Send</button>
                 <button className={styles.outlineBtn} style={{flex:1}}>Clear</button>
               </div>
            </section>
         </div>
      </div>
    </main>
  );
}
\`;

fs.writeFileSync(tsxPath, headerPart + newJsx, 'utf8');
console.log("High fidelity UI update complete.");
