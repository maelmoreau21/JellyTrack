export function createTheme(renderCurrent: () => unknown) {
  return {
    init() {
      this.set(localStorage.getItem('jt_theme') || 'dark');
      document.getElementById('btn-theme-toggle')?.addEventListener('click', () => this.toggle());
    },
    isDark() { return document.documentElement.classList.contains('dark'); },
    toggle() { this.set(this.isDark() ? 'light' : 'dark'); renderCurrent(); },
    set(theme: string) {
      document.documentElement.classList.toggle('dark', theme === 'dark');
      localStorage.setItem('jt_theme', theme);
    }
  };
}
