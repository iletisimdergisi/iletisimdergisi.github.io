(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const issue = new URLSearchParams(location.search).get('sayi') === '01' ? '01' : '02';
  const base = `assets/sayi-${issue}`;
  const status = $('reader-status');
  const reader = $('reader');
  const book = $('book');
  const input = $('page-number');
  let flip, count = 0, busy = false;
  const pageURL = (index) => `${base}-${String(index + 1).padStart(3, '0')}.webp`;
  const startPage = () => {
    const value = Number(new URLSearchParams(location.hash.slice(1)).get('page'));
    return Math.max(0, Math.min(count - 1, Number.isFinite(value) ? value - 1 : 0));
  };
  function preload(index) {
    for (const img of book.querySelectorAll('img[data-index]')) {
      if (Math.abs(Number(img.dataset.index) - index) <= 4 && !img.hasAttribute('src')) {
        img.src = pageURL(Number(img.dataset.index));
      }
    }
  }
  function sync() {
    const index = flip.getCurrentPageIndex();
    preload(index);
    input.value = index + 1;
    $('previous-page').disabled = busy || index === 0;
    const lastSpread = flip.getOrientation() === 'landscape' && index > 0 && index + 2 >= count;
    $('next-page').disabled = busy || index >= count - 1 || lastSpread;
    $('zoom-page').disabled = false;
    $('fullscreen').disabled = false;
    input.disabled = false;
    history.replaceState(null, '', `${location.pathname}${location.search}#page=${index + 1}`);
    $('page-announcement').textContent = `Sayfa ${index + 1} / ${count}`;
  }
  function navigate(direction) {
    if (!flip || busy) return;
    preload(flip.getCurrentPageIndex() + direction * 2);
    direction > 0 ? flip.flipNext() : flip.flipPrev();
  }
  $('previous-page').addEventListener('click', () => navigate(-1));
  $('next-page').addEventListener('click', () => navigate(1));
  $('page-form').addEventListener('submit', (event) => {
    event.preventDefault();
    if (!flip || busy) return;
    const value = Number(input.value);
    if (!Number.isInteger(value) || value < 1 || value > count) return;
    preload(value - 1);
    flip.turnToPage(value - 1);
    sync();
  });
  document.addEventListener('keydown', (event) => {
    if (!flip || $('page-zoom').open || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      navigate(event.key === 'ArrowRight' ? 1 : -1);
    }
    if (event.key === 'Escape' && reader.classList.contains('is-expanded')) toggleExpanded(false);
  });
  function toggleExpanded(expand) {
    reader.classList.toggle('is-expanded', expand);
    document.body.classList.toggle('reader-expanded', expand);
    $('fullscreen').textContent = expand ? 'Küçült' : 'Tam ekran';
    requestAnimationFrame(() => flip.update());
  }
  $('fullscreen').addEventListener('click', async () => {
    if (document.fullscreenElement) { await document.exitFullscreen(); return; }
    if (reader.classList.contains('is-expanded')) { toggleExpanded(false); return; }
    if (reader.requestFullscreen) {
      try { await reader.requestFullscreen(); return; } catch (_) { /* iPhone fallback */ }
    }
    toggleExpanded(true);
  });
  document.addEventListener('fullscreenchange', () => {
    $('fullscreen').textContent = document.fullscreenElement ? 'Küçült' : 'Tam ekran';
    requestAnimationFrame(() => flip.update());
  });
  $('zoom-page').addEventListener('click', () => {
    const index = flip.getCurrentPageIndex();
    const indexes = [index];
    if (flip.getOrientation() === 'landscape' && index > 0 && index + 1 < count) indexes.push(index + 1);
    const pages = $('zoom-pages');
    pages.replaceChildren(...indexes.map((n) => {
      const image = new Image();
      image.src = pageURL(n);
      image.alt = `Sayı ${issue}, sayfa ${n + 1}`;
      return image;
    }));
    $('page-zoom').showModal();
    pages.scrollLeft = 0;
  });
  $('close-zoom').addEventListener('click', () => $('page-zoom').close());
  window.addEventListener('hashchange', () => {
    if (!flip) return;
    const index = startPage();
    preload(index);
    flip.turnToPage(index);
    sync();
  });
  async function init() {
    try {
      const response = await fetch(`${base}.json`);
      if (!response.ok) throw new Error('Dergi bilgisi yüklenemedi.');
      const manifest = await response.json();
      count = manifest.count;
      $('issue-title').textContent = `Sayı ${issue} · ${manifest.period}`;
      document.title = `${manifest.title} — Oku`;
      $('page-count').textContent = `/ ${count}`;
      input.max = count;
      const initial = startPage();
      for (let n = 0; n < count; n++) {
        const page = document.createElement('div');
        page.className = 'book-page';
        page.dataset.label = `Sayfa ${n + 1}`;
        if (n === 0 || n === count - 1) page.dataset.density = 'hard';
        const image = new Image();
        image.dataset.index = n;
        image.alt = `İletişim Dergisi, sayı ${issue}, sayfa ${n + 1}`;
        image.draggable = false;
        image.addEventListener('error', () => {
          status.textContent = 'Bir sayfa yüklenemedi. Bağlantınızı kontrol edip sayfayı yenileyin.';
        });
        page.append(image);
        book.append(page);
      }
      preload(initial);
      await book.querySelector(`img[data-index="${initial}"]`).decode();
      flip = new St.PageFlip(book, {
        width: manifest.width, height: manifest.height,
        size: 'stretch', minWidth: 320, maxWidth: 700, minHeight: 212, maxHeight: 990,
        autoSize: false, showCover: true, usePortrait: true, startPage: initial,
        drawShadow: true, maxShadowOpacity: .3, mobileScrollSupport: false,
        flippingTime: matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 650,
        swipeDistance: 30
      });
      flip.on('init', () => { status.textContent = ''; sync(); });
      flip.on('flip', sync);
      flip.on('changeOrientation', () => requestAnimationFrame(sync));
      flip.on('changeState', (event) => { busy = event.data !== 'read'; sync(); });
      flip.loadFromHTML(book.querySelectorAll('.book-page'));
      new ResizeObserver(() => flip.update()).observe($('reader-stage'));
    } catch (error) {
      console.error(error);
      status.textContent = 'Dergi yüklenemedi. Lütfen sayfayı yenileyin.';
    }
  }
  init();
})();
