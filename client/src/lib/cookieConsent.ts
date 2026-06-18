export type ConsentStatus = 'accepted' | 'declined' | null;

const KEY = 'gridmart_cookie_consent';

export function getConsentStatus(): ConsentStatus {
  try {
    const val = localStorage.getItem(KEY);
    if (val === 'accepted' || val === 'declined') return val as ConsentStatus;
  } catch {}
  return null;
}

function updateGtagConsent(granted: boolean) {
  const value = granted ? 'granted' : 'denied';
  if (typeof (window as any).gtag === 'function') {
    (window as any).gtag('consent', 'update', {
      analytics_storage: value,
      ad_storage: value,
      ad_user_data: value,
      ad_personalization: value,
    });
  }
}

let trackersLoaded = false;

function loadScript(src: string) {
  if (document.querySelector(`script[src="${src}"]`)) return;
  const s = document.createElement('script');
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

function loadTrackers() {
  if (trackersLoaded) return;
  trackersLoaded = true;

  // ContentSquare
  loadScript('https://t.contentsquare.net/uxa/a6494df2d03ae.js');

  // Mouseflow
  (window as any)._mfq = (window as any)._mfq || [];
  loadScript('https://cdn.mouseflow.com/projects/5fa389d2-850c-4525-8eb8-8aa70e6660e7.js');

  // Meta Pixel — initialize stub before SDK loads
  if (!(window as any).fbq) {
    const n: any = function (...args: any[]) {
      n.callMethod ? n.callMethod.apply(n, args) : n.queue.push(args);
    };
    n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
    (window as any).fbq = n;
    (window as any)._fbq = n;
  }
  (window as any).fbq('init', '1354818533359055');
  (window as any).fbq('track', 'PageView');
  loadScript('https://connect.facebook.net/en_US/fbevents.js');

  // GA4 — add VITE_GA4_MEASUREMENT_ID to .env to activate
  const ga4Id = (import.meta as any).env?.VITE_GA4_MEASUREMENT_ID as string | undefined;
  if (ga4Id) {
    loadScript(`https://www.googletagmanager.com/gtag/js?id=${ga4Id}`);
    if (typeof (window as any).gtag === 'function') {
      (window as any).gtag('js', new Date());
      (window as any).gtag('config', ga4Id);
    }
  }
}

export function applyConsent(status: 'accepted' | 'declined') {
  try { localStorage.setItem(KEY, status); } catch {}
  updateGtagConsent(status === 'accepted');
  if (status === 'accepted') loadTrackers();
}

export function initConsent(): ConsentStatus {
  const status = getConsentStatus();
  if (status) applyConsent(status);
  return status;
}
