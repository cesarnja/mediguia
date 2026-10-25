/* Service worker de las dos apps (MediGuía+ y, con «?app=entregas», MediGuía+ Entregas): guarda la
   app en el teléfono para que abra sin internet (apagones, sin datos). No guarda datos de las
   personas: esos están cifrados en el navegador.
   Estrategia: primero la red (para recibir la versión nueva); si tarda más de 4 segundos o no hay
   señal, se usa la copia guardada y la red la actualiza por detrás. */
const APP = new URL(self.location).searchParams.get('app') === 'entregas' ? 'entregas' : 'mediguia';
const CACHE = `${APP}-app-v1`;
const ROOT = new URL('./', self.location).href; // carpeta del sitio (donde está este archivo)
const SCOPE = self.registration.scope; // carpeta de la app que controla
const ICONS = APP === 'entregas' ? ['icon-entregas-192.png', 'icon-entregas-512.png', 'icon-entregas-180.png'] : ['icon-192.png', 'icon-512.png', 'icon-180.png'];
const CORE = [SCOPE, SCOPE + 'index.html', SCOPE + 'manifest.webmanifest', ...ICONS.map((f) => ROOT + 'img/' + f)];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  // Solo borra versiones viejas de ESTA app (la otra app tiene su propia copia).
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(`${APP}-app-`) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Tocar un aviso (recordatorio de medicina) abre la app en la pantalla del aviso.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = SCOPE + ((e.notification.data && e.notification.data.url) || '');
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const win = list.find((w) => w.url.startsWith(SCOPE));
      return win ? win.focus().then((w) => (w && w.navigate ? w.navigate(url) : w)) : self.clients.openWindow(url);
    })
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // Solo archivos de la propia app. Los mapas de OpenStreetMap y lo demás van directo a internet.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // Cada página se guarda con su dirección limpia (sin «?…»; «carpeta/» = «carpeta/index.html»).
  let key = req;
  if (req.mode === 'navigate') {
    url.search = '';
    if (url.pathname.endsWith('/')) url.pathname += 'index.html';
    key = url.href;
  }
  const fromNet = fetch(req).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(key, copy));
    }
    return res;
  });
  // Aunque se muestre la copia guardada, la descarga sigue para dejar lista la versión nueva.
  e.waitUntil(fromNet.catch(() => null));
  const late = new Promise((resolve) => setTimeout(resolve, 4000));
  e.respondWith(
    Promise.race([fromNet.catch(() => null), late.then(() => null)]).then((res) => res || caches.match(key).then((hit) => hit || fromNet))
  );
});
