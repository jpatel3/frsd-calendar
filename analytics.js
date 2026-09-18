// analytics.js — GA4, loaded only on the live site and only once an ID is set,
// so local tinkering never shows up in the numbers and the page stays
// dependency-free for anyone who forks it without an ID.
import { GA_ID } from './schools.js';

const isLive = () => /(^|\.)github\.io$/.test(location.hostname);

export function initAnalytics() {
  if (!GA_ID || !isLive()) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', GA_ID);
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
  document.head.appendChild(s);
}

// No-op when analytics isn't loaded, so call sites don't have to care.
export function track(name, params) {
  if (typeof window.gtag === 'function') window.gtag('event', name, params || {});
}
