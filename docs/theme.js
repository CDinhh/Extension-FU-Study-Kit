// Light by default, dark only when the visitor picked it. Loaded in <head> so dark pages never flash light.
const root = document.documentElement;

try {
    if (localStorage.getItem('theme') === 'dark') root.dataset.theme = 'dark';
} catch { /* storage blocked: stay on the default theme */ }

addEventListener('DOMContentLoaded', () => {
    const toggle = document.querySelector('.theme-toggle');
    const sync = () => toggle.setAttribute('aria-pressed', String(root.dataset.theme === 'dark'));
    sync();
    toggle.hidden = false;

    toggle.addEventListener('click', () => {
        const dark = root.dataset.theme !== 'dark';
        const apply = () => {
            if (dark) root.dataset.theme = 'dark';
            else delete root.dataset.theme;
            sync();
        };
        if (document.startViewTransition) document.startViewTransition(apply);
        else apply();
        try {
            localStorage.setItem('theme', dark ? 'dark' : 'light');
        } catch { /* the choice just won't be remembered */ }
    });
});
