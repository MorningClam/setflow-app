/* =========================================================================
 * Setflow Navigation Helper (Pure Tailwind Version)
 * ========================================================================= */

window.renderBottomNav = function(role, tier = 'free', activePage = '') {
    const navContainer = document.getElementById('bottom-nav-container');
    if (!navContainer) return;

    // Helper to check active state
    const isActive = (page) => activePage.includes(page);
    
    // Theme Colors based on Role
    let activeColorClass = 'text-emerald-400';
    if (role === 'promoter') activeColorClass = 'text-rose-400';
    if (role === 'venue') activeColorClass = 'text-indigo-400';

    const getLinkClass = (page) => {
        const base = "flex flex-col items-center justify-center flex-grow h-full space-y-1 transition-colors duration-200";
        return isActive(page) 
            ? `${base} ${activeColorClass}` 
            : `${base} text-neutral-500 hover:text-neutral-300`;
    };

    // Define Menus
    const menus = {
        musician: [
            { href: 'setflow-musician-dashboard.html', label: 'Home', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6-4a1 1 0 001 1h2a1 1 0 00-1-1h-2a1 1 0 00-1 1v4z' },
            { href: 'setflow-browse-gigs.html', label: 'Gigs', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
            { href: 'setflow-applied-gigs.html', label: 'Applied', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
            { href: 'setflow-inbox.html', label: 'Inbox', icon: 'M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a2 2 0 01-2-2V10a2 2 0 012-2h8z' },
            { href: 'setflow-musician-settings.html', label: 'Account', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' }
        ],
        venue: [
            { href: 'setflow-venue-dashboard.html', label: 'Dash', icon: 'M3 12l2-2m0 0l7-7 7-7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6-4a1 1 0 001 1h2a1 1 0 00-1-1h-2a1 1 0 00-1 1v4z' },
            { href: 'setflow-post-event-page.html', label: 'Post', icon: 'M12 6v6m0 0v6m0-6h6m-6 0H6' },
            { href: 'setflow-inbox.html', label: 'Inbox', icon: 'M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a2 2 0 01-2-2V10a2 2 0 012-2h8z' },
            { href: 'setflow-venue-settings.html', label: 'Account', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' }
        ],
        promoter: [
            { href: 'setflow-promoter-dashboard.html', label: 'Dash', icon: 'M3 12l2-2m0 0l7-7 7-7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6-4a1 1 0 001 1h2a1 1 0 00-1-1h-2a1 1 0 00-1 1v4z' },
            { href: 'setflow-post-event-page.html', label: 'Post', icon: 'M12 6v6m0 0v6m0-6h6m-6 0H6' },
            { href: 'setflow-inbox.html', label: 'Inbox', icon: 'M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a2 2 0 01-2-2V10a2 2 0 012-2h8z' },
            { href: 'setflow-promoter-settings.html', label: 'Account', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' }
        ]
    };

    const links = menus[role] || menus['musician'];

    const navHtml = links.map(link => `
        <a href="${link.href}" class="${getLinkClass(link.href)}">
            <svg class="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="${link.icon}" /></svg>
            <span class="text-[10px] font-medium">${link.label}</span>
        </a>
    `).join('');

    navContainer.innerHTML = navHtml;
};