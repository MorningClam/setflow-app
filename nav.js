/* =========================================================================
 * Setflow Dynamic Navigation Helper (Fixed Consistency)
 * ========================================================================= */

/**
 * Renders the correct bottom navigation bar based on user role.
 * @param {string} role - The user's primary role ('musician', 'venue', 'promoter').
 * @param {string} tier - The user's subscription tier (unused for nav structure now).
 * @param {string} activePage - The filename of the current page (e.g., 'setflow-inbox.html').
 */
window.renderBottomNav = function(role, tier = 'free', activePage = '') {
    const navContainer = document.getElementById('bottom-nav-container');
    if (!navContainer) return;

    const isActive = (page) => page === activePage ? 'active text-emerald-400' : 'text-neutral-400';
    const isCurrent = (page) => page === activePage ? 'aria-current="page"' : '';

    let navHtml = '';

    if (role === 'musician') {
        // Musician Nav (5 Items)
        navHtml = `
            <a href="setflow-musician-dashboard.html" class="bottom-nav-link ${isActive('setflow-musician-dashboard.html')}" ${isCurrent('setflow-musician-dashboard.html')} aria-label="Home">
                <svg class="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6-4a1 1 0 001 1h2a1 1 0 00-1-1h-2a1 1 0 00-1 1v4z" /></svg>
                <span class="text-xs font-medium">Home</span>
            </a>
            <a href="setflow-browse-gigs.html" class="bottom-nav-link ${isActive('setflow-browse-gigs.html')}" ${isCurrent('setflow-browse-gigs.html')} aria-label="Gigs">
                <svg class="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <span class="text-xs font-medium">Gigs</span>
            </a>
            <a href="setflow-applied-gigs.html" class="bottom-nav-link ${isActive('setflow-applied-gigs.html')}" ${isCurrent('setflow-applied-gigs.html')} aria-label="Applied">
                <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                <span class="text-xs font-medium">Applied</span>
            </a>
            <a href="setflow-inbox.html" class="bottom-nav-link ${isActive('setflow-inbox.html')}" ${isCurrent('setflow-inbox.html')} aria-label="Inbox">
                <svg class="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a2 2 0 01-2-2V10a2 2 0 012-2h8z" /></svg>
                <span class="text-xs font-medium">Inbox</span>
            </a>
            <a href="setflow-musician-settings.html" class="bottom-nav-link ${isActive('setflow-musician-settings.html')}" ${isCurrent('setflow-musician-settings.html')} aria-label="Account">
                <svg class="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
                <span class="text-xs font-medium">Account</span>
            </a>
        `;
    } else {
        // Venue/Promoter Nav (4 Items)
        const dashLink = role === 'venue' ? 'setflow-venue-dashboard.html' : 'setflow-promoter-dashboard.html';
        const settingsLink = role === 'venue' ? 'setflow-venue-settings.html' : 'setflow-promoter-settings.html';
        
        navHtml = `
            <a href="${dashLink}" class="bottom-nav-link ${isActive(dashLink)}" ${isCurrent(dashLink)} aria-label="Dashboard">
                <svg aria-hidden="true" class="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v1a1 1 0 01-1 1H4a1 1 0 01-1-1V3zm0 4a1 1 0 011-1h12a1 1 0 011 1v1a1 1 0 01-1 1H4a1 1 0 01-1-1V7zm0 4a1 1 0 011-1h12a1 1 0 011 1v1a1 1 0 01-1 1H4a1 1 0 01-1-1v-1zm0 4a1 1 0 011-1h12a1 1 0 011 1v1a1 1 0 01-1 1H4a1 1 0 01-1-1v-1z" clip-rule="evenodd"></path></svg>
                <span class="text-xs font-medium">Dashboard</span>
            </a>
            <a href="setflow-post-event-page.html" class="bottom-nav-link ${isActive('setflow-post-event-page.html')}" ${isCurrent('setflow-post-event-page.html')} aria-label="Post Gig">
                <svg aria-hidden="true" class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 6v12m6-6H6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                <span class="text-xs font-medium">Post</span>
            </a>
            <a href="setflow-inbox.html" class="bottom-nav-link ${isActive('setflow-inbox.html')}" ${isCurrent('setflow-inbox.html')} aria-label="Inbox">
                <svg aria-hidden="true" class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M17 8h2a2 2 0 01-2 2h-2v4l-4-4H9a2 2 0 01-2-2V10a2 2 0 012-2h8z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                <span class="text-xs font-medium">Inbox</span>
            </a>
            <a href="${settingsLink}" class="bottom-nav-link ${isActive(settingsLink)}" ${isCurrent(settingsLink)} aria-label="Account">
               <svg aria-hidden="true" class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              <span class="text-xs font-medium">Account</span>
            </a>
        `;
    }
    navContainer.innerHTML = navHtml;
}