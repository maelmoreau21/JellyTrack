
  <div id="app-root">
    <aside class="sidebar" id="app-sidebar"></aside>

    <!-- Mobile Drawer Overlay Backdrop -->
    <div class="sidebar-backdrop" id="sidebar-backdrop" aria-hidden="true"></div>

    <!-- Main Container Layout -->
    <div class="main-wrapper">
      <header class="topbar">
        <button type="button" class="mobile-menu-btn" id="mobile-menu-btn" aria-label="Open menu" aria-expanded="false" aria-controls="app-sidebar"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>
        <a data-link href="/" class="mobile-brand-link"><span id="mobile-brand-logo"></span><span>JellyTrack</span></a>
      </header>

      <button id="wrapped-close-btn" class="wrapped-close-btn" type="button" aria-label="Fermer" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button>

      <!-- Router Viewport Outlet -->
      <main id="app-main">
        <!-- Rendered dynamically by app.js router -->
      </main>
    </div>
  </div>

  <!-- Global Action Modal (Kill stream, confirmations, forms) -->
  <div class="modal-backdrop" id="action-modal" role="dialog" aria-modal="true" aria-labelledby="action-modal-title">
    <div class="modal-box">
      <div class="modal-header">
        <h2 class="modal-title" id="action-modal-title">Titre</h2>
        <button class="btn btn-icon btn-sm" id="action-modal-close" aria-label="Fermer">✕</button>
      </div>
      <div class="modal-body" id="action-modal-body">
        <!-- Dynamic content -->
      </div>
      <div class="modal-footer" id="action-modal-footer">
        <button class="btn btn-secondary" id="action-modal-cancel">Annuler</button>
        <button class="btn btn-primary" id="action-modal-confirm">Confirmer</button>
      </div>
    </div>
  </div>

  <!-- Floating Toast Notifications Container -->
  <div id="toast-container" aria-live="polite"></div>

  <!-- Main Vanilla JS Client Application -->
  
  

