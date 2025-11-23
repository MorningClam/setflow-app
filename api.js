/* =========================================================================
 * Setflow Frontend API Helper (Robust & Secure)
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

// --- Security & Utils ---
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

// --- Network Status ---
const network = {
  online: navigator.onLine,
  init: function() {
    window.addEventListener('online', () => this.update(true));
    window.addEventListener('offline', () => this.update(false));
  },
  update: function(status) {
    this.online = status;
    document.body.dispatchEvent(new CustomEvent('app:network-change', { detail: { online: status } }));
    if(status && window.toast) window.toast.show('Back online.', 'success');
  },
  isOnline: function() { return this.online; }
};
network.init();
export const isOnline = () => network.isOnline();

// --- Helper: Graceful Fetch ---
export async function gracefulGet(promise, fallback = null) {
    try { return await promise; }
    catch (e) { console.error(e); return fallback; }
}

// --- Helper: Batch User Fetching (Performance) ---
async function getUsersBatch(userIds) {
    const cleanIds = [...new Set(userIds.filter(id => id))].slice(0, 10);
    if (cleanIds.length === 0) return {};
    try {
        const q = query(collection(db, "users"), where(documentId(), 'in', cleanIds));
        const snap = await getDocs(q);
        const map = {};
        snap.forEach(d => map[d.id] = d.data());
        return map;
    } catch (e) { console.error("Batch fetch error", e); return {}; }
}

// --- AUTH ---
export function onAuthState(cb) { return onAuthStateChanged(auth, cb); }
export async function signInUser(e, p) { return signInWithEmailAndPassword(auth, e, p); }
export async function signOutUser() { return signOut(auth); }
export async function signUpUser(name, email, password, role) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
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

// FIX: Use setDoc with merge:true to handle both create and update scenarios gracefully
export async function updateUserProfile(uid, data) {
    return setDoc(doc(db, "users", uid), { ...data, updatedAt: serverTimestamp() }, { merge: true });
}

export async function updateUserPreferences(uid, data) {
    return setDoc(doc(db, "users", uid), { ...data, updatedAt: serverTimestamp() }, { merge: true });
}

// --- GIGS & POSTS ---
export async function fetchPlayerPosts() {
    const q = query(collection(db, "player_posts"), orderBy("createdAt", "desc"), limit(20));
    const snap = await gracefulGet(getDocs(q));
    if (!snap) return null;

    const posts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const userMap = await getUsersBatch(posts.map(p => p.userId));

    return posts.map(p => ({
        ...p,
        userName: userMap[p.userId]?.name || 'Unknown',
        userProfileImage: userMap[p.userId]?.profileImageUrl,
        date: p.dateTime?.toDate ? p.dateTime.toDate().toLocaleString() : p.date
    }));
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
    return addDoc(collection(db, "gigs"), { 
        ...data, 
        date: Timestamp.fromDate(dateObj), 
        status: 'open', 
        createdAt: serverTimestamp() 
    });
}

// --- MESSAGING ---
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
    const convos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const userMap = await getUsersBatch(convos.flatMap(c => c.participants)); 
    
    return convos.map(c => {
        const otherId = c.participants.find(p => p !== uid);
        return { ...c, otherUserId: otherId, otherUserName: userMap[otherId]?.name || 'Unknown', otherUserImage: userMap[otherId]?.profileImageUrl };
    });
}

// --- APPS & BOOKING ---
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
    const apps = snap.docs.map(d => d.data());
    const userMap = await getUsersBatch(apps.map(a => a.userId));
    return apps.map(a => ({ ...a, ...userMap[a.userId], id: a.userId }));
}
export async function confirmBooking(gigId, artistId, artistName) {
    const batch = writeBatch(db);
    batch.update(doc(db, "gigs", gigId), { status: 'booked', bookedArtistId: artistId, bookedArtistName: artistName });
    // Create calendar event
    batch.set(doc(collection(db, "calendarEvents")), { 
        userId: artistId, type: 'gig', title: 'Gig Booking', notes: `Booked as ${artistName}`, dateTime: Timestamp.now(), gigId 
    });
    return batch.commit();
}

// --- MOCK / PLACEHOLDERS (Restored for robustness) ---
export async function fetchCalendarEvents(uid) { 
    // Real fetch logic
    const q = query(collection(db, "calendarEvents"), where("userId", "==", uid), orderBy("dateTime", "asc"));
    const snap = await gracefulGet(getDocs(q));
    if(!snap) return [];
    return snap.docs.map(d => {
        const data = d.data();
        const date = data.dateTime?.toDate ? data.dateTime.toDate() : new Date();
        return { id: d.id, ...data, dateObject: date, formattedDate: date.toLocaleDateString(), formattedTime: date.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) };
    });
}

// These allow the UI to render even if DB is empty
export async function fetchMyApplications(uid) { return []; }
export async function fetchGigsForOwner(uid) { return fetchGigs(); } // Fallback to all gigs for proto
export async function fetchCompletedGigsForUser(uid) { return []; }
export async function getBandsForUser(uid) { return []; }
export async function getBandData(id) { return null; }
export async function getJoinRequests(id) { return []; }
export async function inviteToBand(bid, email) {}
export async function removeMemberFromBand(bid, uid) {}
export async function approveJoinRequest(rid) {}
export async function createJamSession(data) { return addDoc(collection(db, "jam_sessions"), data); }
export async function fetchJamSessions() { return []; }
export async function createGearListing(data) { return addDoc(collection(db, "gear_listings"), data); }
export async function fetchGearListings() { return []; }
export async function getGearListing(id) { return null; }
export async function getAllPlayers() { return []; }
export async function createReview(data) { return addDoc(collection(db, "reviews"), data); }
export async function fetchNotifications(uid) { 
    return [
        { type: 'system', text: 'Welcome to Setflow!', timestampRelative: 'Just now', isUnread: true }
    ]; 
}
export async function fetchUserNetwork(uid) { return []; }
export async function fetchGigTemplates(uid) { return []; }
export async function createCalendarEvent(data) { return addDoc(collection(db, "calendarEvents"), { ...data, createdAt: serverTimestamp() }); }
export async function requestToJoinBand(bid, uid) {}
export async function getAllBands() { return []; }
export async function reportContent(itemId, type, reporterId, reason) {
    return addDoc(collection(db, "reports"), { itemId, type, reporterId, reason, createdAt: serverTimestamp() });
}