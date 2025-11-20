/* =========================================================================
 * Setflow Shared Components
 * ========================================================================= */

export function loadCommonHead() {
    const head = document.head;
    
    if (document.getElementById('setflow-common-styles')) return;

    const meta = document.createElement('meta');
    meta.name = "viewport";
    meta.content = "width=device-width, initial-scale=1.0";
    head.appendChild(meta);

    // Tailwind
    const script = document.createElement('script');
    script.src = "https://cdn.tailwindcss.com";
    head.appendChild(script);

    // Fonts
    const link1 = document.createElement('link');
    link1.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap";
    link1.rel = "stylesheet";
    head.appendChild(link1);

    // Toast CSS
    const link2 = document.createElement('link');
    link2.rel = "stylesheet";
    link2.href = "toast.css";
    head.appendChild(link2);

    // Offline Banner & Common Styles
    const style = document.createElement('style');
    style.id = 'setflow-common-styles';
    style.textContent = `
        body { font-family: 'Inter', sans-serif; }
        #offline-banner {
            display: none;
            position: fixed; top: 0; left: 0; right: 0;
            padding: 0.5rem;
            background-color: #DC2626;
            color: white; text-align: center;
            font-size: 0.875rem; font-weight: 500;
            z-index: 9999;
        }
        .loading-spinner {
            display: inline-block; width: 1.5rem; height: 1.5rem; 
            border: 4px solid rgba(115, 115, 115, 0.3); border-radius: 50%; 
            border-top-color: #10B981; animation: spin 1s ease-in-out infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
    `;
    head.appendChild(style);
}

/**
 * Renders the standard application header.
 * @param {string} title - The title to display.
 * @param {string|null} backLink - URL for back button, 'history', or null.
 * @param {string|null} rightActionHtml - Optional HTML for right button.
 */
export function renderHeader(title, backLink = null, rightActionHtml = null) {
    const header = document.createElement('header');
    header.className = "fixed top-0 left-0 right-0 z-20 mx-auto h-16 max-w-md border-b border-neutral-700 bg-neutral-800/90 px-4 backdrop-blur-sm";
    
    let leftContent = '<div class="w-10 h-10"></div>';
    
    if (backLink) {
        if (backLink === 'history') {
             leftContent = `
                <a href="javascript:history.back()" class="p-2 rounded-full text-neutral-300 hover:bg-neutral-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 focus:ring-offset-neutral-900">
                   <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
                </a>`;
        } else {
             leftContent = `
                <a href="#" onclick="window.goBackOr ? window.goBackOr('${backLink}') : window.location.href='${backLink}'; return false;" class="p-2 rounded-full text-neutral-300 hover:bg-neutral-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 focus:ring-offset-neutral-900">
                    <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
                </a>`;
        }
    }

    const rightContent = rightActionHtml ? rightActionHtml : '<div class="w-10 h-10"></div>';

    header.innerHTML = `
        <div class="flex h-full items-center justify-between">
            ${leftContent}
            <h1 class="flex-grow text-center text-lg font-semibold tracking-tight">${title}</h1>
            ${rightContent}
        </div>
    `;
    
    const container = document.querySelector('.max-w-md');
    if (container) {
        container.prepend(header);
    } else {
        document.body.prepend(header);
    }
}

loadCommonHead();