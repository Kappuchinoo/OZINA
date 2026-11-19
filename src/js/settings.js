const settingRow = (label, detail, control) => `<div class="setting-row"><div><div class="setting-label">${label}</div><div class="setting-detail">${detail}</div></div>${control}</div>`;

export function renderSettings(prefs) {
  const shortcuts = (prefs.shortcuts || []).slice(0, 8);
  const engines = ['DuckDuckGo', 'Google', 'Brave Search'];
  const engine = engines.includes(prefs.engine) ? prefs.engine : 'DuckDuckGo';
  return `<section class="panel-view"><header class="panel-head"><div class="eyebrow">PREFERENCES / 01</div><h1>Make it yours.</h1><p>A quieter browser, tuned to the way you work.</p></header><div class="settings-layout"><nav class="settings-nav" aria-label="Settings sections"><button class="is-selected" data-settings-section="Appearance">Appearance</button><button data-settings-section="Typography">Typography</button><button data-settings-section="Behavior">Behavior</button></nav><div class="settings-content">
    <section class="setting-section" data-settings-group="Appearance"><h2>Appearance</h2><p>Set the tone of your workspace.</p>
      ${settingRow('Theme','Choose a surface for your browser',`<div class="segmented"><button data-pref="theme" data-value="dark" aria-pressed="${prefs.theme==='dark'}">Dark</button><button data-pref="theme" data-value="light" aria-pressed="${prefs.theme==='light'}">Light</button></div>`)}
      ${settingRow('Accent color','A precise point of focus',`<div class="swatches">${['#C7FF55','#8D9EFF','#FF9B7A','#E5E2D8'].map(c=>`<button class="swatch" style="--swatch:${c}" data-pref="accent" data-value="${c}" aria-label="Accent ${c}" aria-pressed="${prefs.accent===c}"></button>`).join('')}</div>`)}
      ${settingRow('Ambient dots','Subtle texture on the new tab',`<button class="toggle" role="switch" aria-label="Ambient dots" aria-checked="${prefs.ambient}"></button>`)}
    </section>
    <section class="setting-section" data-settings-group="Appearance"><h2>New tab shortcuts</h2><p>Choose up to eight sites to keep close.</p>
      ${settingRow('Shortcut collection',`${shortcuts.length} of 8 shortcuts`,`<button class="settings-action" data-action="toggle-shortcuts" aria-expanded="false" aria-controls="shortcut-manager">Edit shortcuts</button>`)}
      <div id="shortcut-manager" class="shortcut-manager" hidden>
        ${shortcuts.map((shortcut, index) => `<div class="shortcut-pref-row"><span class="shortcut-pref-name">${shortcut.name}</span><span class="shortcut-pref-url">${shortcut.url}</span><button class="remove-shortcut" data-remove-shortcut="${index}" aria-label="Remove ${shortcut.name}">Remove</button></div>`).join('')}
        ${shortcuts.length < 8 ? `<form id="shortcut-form" class="shortcut-form"><label><span>Name</span><input name="name" maxlength="24" required placeholder="Site name"></label><label><span>Address</span><input name="url" required placeholder="example.com"></label><button class="settings-action" type="submit">Add shortcut</button></form>` : '<p class="shortcut-limit">Maximum of eight shortcuts reached.</p>'}
      </div>
    </section>
    <section class="setting-section" data-settings-group="Typography" hidden><h2>Typography</h2><p>Choose a comfortable reading scale.</p>
      ${settingRow('Interface type','Typography across menus and controls',`<select class="select-control" data-pref="font"><option value="Comfortaa" ${prefs.font==='Comfortaa'?'selected':''}>Comfortaa</option><option value="Inter" ${prefs.font==='Inter'?'selected':''}>Inter</option><option value="Arial" ${prefs.font==='Arial'?'selected':''}>Arial</option><option value="system" ${prefs.font==='system'?'selected':''}>System default</option></select>`)}
      ${settingRow('Interface scale','Adjust the size of labels and controls',`<div class="segmented"><button data-pref="scale" data-value="compact" aria-pressed="${prefs.scale==='compact'}">Compact</button><button data-pref="scale" data-value="comfortable" aria-pressed="${prefs.scale==='comfortable'}">Comfortable</button></div>`)}
    </section>
    <section class="setting-section" data-settings-group="Behavior" hidden><h2>Behavior</h2><p>Prototype preferences are saved on this device.</p>
      ${settingRow('Reveal toolbar','Choose whether browser controls stay visible',`<div class="segmented"><button data-pref="toolbarMode" data-value="always" aria-pressed="${prefs.toolbarMode==='always'}">Always show</button><button data-pref="toolbarMode" data-value="on-demand" aria-pressed="${prefs.toolbarMode==='on-demand'}">On demand</button></div>`)}
      ${settingRow('Search engine','Used for mock search submissions',`<select class="select-control" data-pref="engine">${engines.map(item=>`<option value="${item}" ${engine===item?'selected':''}>${item}</option>`).join('')}</select>`)}
    </section>
  </div></div></section>`;
}
