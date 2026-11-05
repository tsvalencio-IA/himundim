(() => {
  "use strict";
  const cards = [...document.querySelectorAll("[data-slug]")];
  const bySlug = new Map();
  cards.forEach(card => {
    const slug = card.dataset.slug;
    if (!bySlug.has(slug)) bySlug.set(slug, []);
    bySlug.get(slug).push(card);
  });
  async function getMeta(slug) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch("/api/himundim-meta?slug=" + encodeURIComponent(slug), { signal: controller.signal });
      return response.ok ? await response.json() : null;
    } catch (_) { return null; }
    finally { clearTimeout(timer); }
  }
  function safeImage(value) {
    try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.href : ""; }
    catch (_) { return ""; }
  }
  getMeta("home").then(meta => {
    const url = meta && safeImage(meta.logo), logo = document.getElementById("sourceLogo"), fallback = document.getElementById("brandFallback");
    if (!url || !logo) return;
    logo.onload = () => { logo.hidden = false; if (fallback) fallback.hidden = true; };
    logo.onerror = () => { logo.hidden = true; if (fallback) fallback.hidden = false; };
    logo.src = url;
  });
  const queue = [], requested = new Set();
  let active = 0;
  function pump() {
    while (queue.length && active < 3) {
      const slug = queue.shift();
      active++;
      getMeta(slug).then(meta => {
        const url = meta && safeImage(meta.image);
        if (!url) return;
        bySlug.get(slug).forEach(card => {
          const img = card.querySelector("img");
          if (!img) return;
          img.onload = () => card.classList.add("image-ready");
          img.onerror = () => card.classList.remove("image-ready");
          img.decoding = "async";
          img.alt = "";
          img.src = url;
        });
      }).finally(() => { active--; pump(); });
    }
  }
  function request(slug) {
    if (requested.has(slug)) return;
    requested.add(slug); queue.push(slug); pump();
  }
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { observer.unobserve(entry.target); request(entry.target.dataset.slug); }
    }), { rootMargin: "360px" });
    cards.forEach(card => observer.observe(card));
  } else bySlug.forEach((_, slug) => request(slug));
})();
