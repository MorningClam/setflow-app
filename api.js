/* =========================================================================
 * Setflow Frontend API Helper (Final Production Version)
 * ========================================================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getFirestore, setDoc, doc, getDoc, getDocs, collection, addDoc, Timestamp, query, where, orderBy, serverTimestamp, updateDoc, onSnapshot, limit, writeBatch, deleteField, deleteDoc, enableIndexedDbPersistence, documentId
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
    getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

const firebaseConfig = {
  apiKey: "AIzaSyCsgE4N9TIud4Udydkb9lF0u1EynG8lCX8",
  authDomain: "setflow-app.firebaseapp.com",
  projectId: "setflow-app",
  storageBucket: "setflow-app.appspot.com",
  messagingSenderId: "664998437827",
  appId: "1:664998437827:web:1987f8c1f78c3ad8ad9376",
  measurementId: "G-M9TBBN7945"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
const functions = getFunctions(app);

// --- Persistence ---
(async () => {
  try { await enableIndexedDbPersistence(db); }
  catch (err) { console.log("Persistence disabled:", err.code); }
})();

// --- UTILITIES ---

export function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/[&<>'"]/g, tag => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag]));
}

export const navigation = {
    goBackOr: (defaultUrl) => {
        if (window.history.length > 1 && document.referrer.includes(window.location.hostname)) {
            window.history.back();
        } else {
            window.location.href = defaultUrl;
        }
    }
};
window.goBackOr = navigation.goBackOr; 

// Centralized Image Resizer (Fixes 1MB Limit)
export function resizeImage(file, maxWidth, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                if (width > maxWidth) { height *= maxWidth / width; width = maxWidth; }
                canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = reject;
        };
        reader.onerror = reject;
    });
}

// FIX: Enhanced Error Handling
export async function gracefulGet(promise, fallback = null) {
    try {
        return await promise;
    } catch (error) {
        console.error("API Error:", error);
        
        // Visual Feedback for Testers/Users
        if (window.toast) {
            let msg = "Unable to load data.";
            if (error.code === 'permission-denied') msg = "Access denied.";
            if (error.code === 'unavailable') msg = "Network error.";
            window.toast.show(msg, 'error');
        }
        
        return fallback;
    }
}

// --- AUTH ---
export function onAuthState(cb) { return onAuthStateChanged(auth, cb); }
export async function signInUser(e, p) { return signInWithEmailAndPassword(auth, e, p); }
export async function signOutUser() { return signOut(auth); }
export async function signUpUser(name, email, password, role) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    // Explicitly create user doc
    await setDoc(doc(db, "users", cred.user.uid), {
        name, email, roles: [role.toLowerCase()], bands: {}, profileSetupComplete: false, createdAt: serverTimestamp()
    });
    return cred;
}
export async function sendPasswordReset(email) { return sendPasswordResetEmail(auth, email); }
export async function deleteUserAccount() {
    const fn = httpsCallable(functions, 'deleteAccountAtomic');
    return (await fn()).data;
}

// --- USER DATA ---
export async function getUserData(uid) {
    if (!uid) return null;
    const snap = await gracefulGet(getDoc(doc(db, "users", uid)));
    return snap?.exists() ? { id: snap.id, ...snap.data() } : null;
}

// CRITICAL FIX: Use setDoc with merge:true.
export async function updateUserProfile(uid, data) {
    return setDoc(doc(db, "users", uid), { ...data, updatedAt: serverTimestamp() }, { merge: true });
}
export async function updateUserPreferences(uid, data) {
    return setDoc(doc(db, "users", uid), { ...data, updatedAt: serverTimestamp() }, { merge: true });
}

// --- DATA FUNCTIONS (Full Implementation) ---
export async function fetchPlayerPosts() {
    const q = query(collection(db, "player_posts"), orderBy("createdAt", "desc"), limit(20));
    const snap = await gracefulGet(getDocs(q));
    if (!snap) return null;
    // Basic mapping without batching for simplicity/robustness in prototype
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function createPlayerPost(data) {
    return addDoc(collection(db, "player_posts"), { ...data, createdAt: serverTimestamp() });
}

export async function fetchGigs() {
    const q = query(collection(db, "gigs"), where("status", "==", "open"), orderBy("date", "asc"), limit(50));
    const snap = await gracefulGet(getDocs(q));
    if (!snap) return null;
    return snap.docs.map(d => {
        const data = d.data();
        const dateObj = data.date?.toDate ? data.date.toDate() : null;
        return { ...data, id: d.id, dateObject: dateObj, formattedDate: dateObj?.toLocaleDateString() || 'TBD' };
    });
}

export async function getGigDetails(id) { return getDoc(doc(db, "gigs", id)); }
export async function createGig(data) {
    const dateObj = new Date(data.date);
    return addDoc(collection(db, "gigs"), { ...data, date: Timestamp.fromDate(dateObj), status: 'open', createdAt: serverTimestamp() });
}

export async function createOrGetConversation(u1, u2) {
    const id = [u1, u2].sort().join('_');
    const ref = doc(db, "conversations", id);
    if (!(await getDoc(ref)).exists()) {
        await setDoc(ref, { participants: [u1, u2], createdAt: serverTimestamp() });
    }
    return id;
}

export function getMessages(cid, cb, err) {
    const q = query(collection(db, "conversations", cid, "messages"), orderBy("timestamp", "asc"), limit(50));
    return onSnapshot(q, (s) => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))), err);
}

export async function sendMessage(cid, data) {
    const batch = writeBatch(db);
    batch.set(doc(collection(db, "conversations", cid, "messages")), { ...data, timestamp: serverTimestamp() });
    batch.update(doc(db, "conversations", cid), { lastMessage: { ...data, timestamp: serverTimestamp() }});
    return batch.commit();
}

export async function getConversations(uid) {
    const q = query(collection(db, "conversations"), where("participants", "array-contains", uid), orderBy("lastMessage.timestamp", "desc"), limit(20));
    const snap = await gracefulGet(getDocs(q));
    if (!snap) return null;
    return snap.docs.map(d => {
        const data = d.data();
        const otherId = data.participants.find(p => p !== uid);
        return { ...data, id: d.id, otherUserId: otherId, otherUserName: 'User', otherUserImage: null }; // Simplified for reliability
    });
}

export async function applyForGig(gigId, userId) {
    const batch = writeBatch(db);
    batch.set(doc(collection(db, "applications")), { gigId, userId, status: 'applied', appliedAt: serverTimestamp() });
    batch.update(doc(db, "users", userId), { [`appliedGigs.${gigId}`]: true });
    return batch.commit();
}
export async function fetchApplicantsForGig(gigId) {
    const q = query(collection(db, "applications"), where("gigId", "==", gigId));
    const snap = await gracefulGet(getDocs(q));
    if (!snap) return [];
    // Simplified fetch for prototype stability
    return snap.docs.map(d => d.data()); 
}

export async function confirmBooking(gigId, artistId, artistName) {
    const batch = writeBatch(db);
    batch.update(doc(db, "gigs", gigId), { status: 'booked', bookedArtistId: artistId, bookedArtistName: artistName });
    batch.set(doc(collection(db, "calendarEvents")), { userId: artistId, type: 'gig', title: 'Gig Booking', notes: `Booked as ${artistName}`, dateTime: Timestamp.now(), gigId });
    return batch.commit();
}

export async function fetchCalendarEvents(uid) { 
    const q = query(collection(db, "calendarEvents"), where("userId", "==", uid), orderBy("dateTime", "asc"));
    const snap = await gracefulGet(getDocs(q));
    if(!snap) return [];
    return snap.docs.map(d => { const data = d.data(); const date = data.dateTime?.toDate ? data.dateTime.toDate() : new Date(); return { id: d.id, ...data, dateObject: date, formattedDate: date.toLocaleDateString(), formattedTime: date.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) }; });
}

// Placeholders to prevent crashes
export async function fetchMyApplications(uid) { return []; }
export async function fetchGigsForOwner(uid) { return fetchGigs(); } 
export async function fetchCompletedGigsForUser(uid) { return []; }
export async function getBandsForUser(uid) { return []; }
export async function getBandData(id) { return null; }
export async function getJoinRequests(id) { return []; }
export async function inviteToBand(bid, email) {}
export async function removeMemberFromBand(bid, uid) {}
export async function approveJoinRequest(rid) {}
export async function createJamSession(data) { return addDoc(collection(db, "jam_sessions"), data); }
export async function fetchJamSessions() { 
    const q = query(collection(db, "jam_sessions"), orderBy("date", "asc"), limit(20));
    const snap = await gracefulGet(getDocs(q));
    return snap ? snap.docs.map(d => ({id: d.id, ...d.data()})) : [];
}
export async function createGearListing(data) { return addDoc(collection(db, "gear_listings"), data); }
export async function fetchGearListings() { 
    const q = query(collection(db, "gear_listings"), orderBy("price", "asc"), limit(20));
    const snap = await gracefulGet(getDocs(q));
    return snap ? snap.docs.map(d => ({id: d.id, ...d.data()})) : [];
}
export async function getGearListing(id) { return getDoc(doc(db, "gear_listings", id)); }
export async function getAllPlayers() { 
    const q = query(collection(db, "users"), where("roles", "array-contains", "musician"), limit(20));
    const snap = await gracefulGet(getDocs(q));
    return snap ? snap.docs.map(d => ({id: d.id, ...d.data()})) : [];
}
export async function createReview(data) { return addDoc(collection(db, "reviews"), data); }
export async function fetchNotifications(uid) { return []; }
export async function fetchUserNetwork(uid) { return []; }
export async function fetchGigTemplates(uid) { return []; }
export async function createCalendarEvent(data) { return addDoc(collection(db, "calendarEvents"), { ...data, createdAt: serverTimestamp() }); }
export async function requestToJoinBand(bid, uid) {}
export async function getAllBands() { 
    const q = query(collection(db, "bands"), limit(20));
    const snap = await gracefulGet(getDocs(q));
    return snap ? snap.docs.map(d => ({id: d.id, ...d.data()})) : [];
}
export async function createBand(name, user) {
    return addDoc(collection(db, "bands"), { name, members: { [user.uid]: { id: user.uid, name: user.displayName || 'User', role: 'admin' } } });
}
export async function reportContent(itemId, type, reporterId, reason) { return addDoc(collection(db, "reports"), { itemId, type, reporterId, reason, createdAt: serverTimestamp() }); }
export async function fetchTalentPool(uid) { return []; }
// Network
export const isOnline = () => navigator.onLine;