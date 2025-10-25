// [File: public/js/profile-setup.js]

import { auth, onAuthState, getUserData, updateUserProfile } from './api.js';
import { toast } from './toast.js';

document.addEventListener('DOMContentLoaded', () => {
  const finishButton = document.getElementById('finish-button');
  const bioInput = document.getElementById('bio');
  const locationInput = document.getElementById('location');
  const websiteInput = document.getElementById('website-link');
  const spotifyInput = document.getElementById('spotify-link');
  const instagramInput = document.getElementById('instagram-link');

  let currentUserId = null;

  onAuthState(async (user) => {
    if (user) {
      currentUserId = user.uid;
      // Load existing data if user is editing
      try {
        const userData = await getUserData(user.uid);
        if (userData) {
          if (bioInput && userData.bio) bioInput.value = userData.bio;
          if (locationInput && userData.location) locationInput.value = userData.location;
          if (websiteInput && userData.website) websiteInput.value = userData.website;
          if (spotifyInput && userData.spotify) spotifyInput.value = userData.spotify;
          if (instagramInput && userData.instagram) instagramInput.value = userData.instagram;
        }
      } catch (error) {
        console.error("Error loading existing profile data:", error);
        toast.show("Could not load existing profile data.", "error");
      }
    } else {
      // Not logged in, redirect to login
      window.location.href = 'setflow-login-page.html';
    }
  });

  if (finishButton) {
    finishButton.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!currentUserId) {
        toast.show('You must be logged in to update your profile.', 'error');
        return;
      }

      const profileData = {
        bio: bioInput?.value || '',
        location: locationInput?.value || '',
        website: websiteInput?.value || '',
        spotify: spotifyInput?.value || '',
        instagram: instagramInput?.value || '',
        profileSetupComplete: true // Add a flag
      };

      try {
        finishButton.disabled = true;
        finishButton.textContent = 'Saving...';
        
        // Save profile data
        await updateUserProfile(currentUserId, profileData);
        
        // --- START FIX (Critical Issue #1) ---

        // Fetch user data again to get their role
        const userData = await getUserData(currentUserId);
        const role = (userData && userData.roles && userData.roles.length > 0) ? userData.roles[0] : null;

        // Set toast message for the NEXT page
        sessionStorage.setItem('showToast', 'Profile updated successfully!|success');

        // Redirect immediately based on role
        if (role === 'musician') {
          window.location.href = 'setflow-musician-dashboard.html';
        } else if (role === 'venue') {
          window.location.href = 'setflow-venue-dashboard.html';
        } else {
          // Fallback to login or index if role is unknown
          console.warn("Unknown user role, redirecting to login.");
          window.location.href = 'setflow-login-page.html';
        }
        
        // --- END FIX ---

      } catch (error) {
        console.error('Error updating profile: ', error);
        toast.show(`Error saving profile: ${error.message}`, 'error');
        finishButton.disabled = false;
        finishButton.textContent = 'Finish';
      }
    });
  }
});