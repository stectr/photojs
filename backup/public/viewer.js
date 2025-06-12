async function loadGallery() {
    const photos = await (await fetch('/api/photos')).json();
    const gallery = document.getElementById('gallery');
    gallery.innerHTML = photos.map(p => (
        `<div class="col-lg-4 col-md-6 col-12 mb-4">
      <img src="${p.url}" class="img-fluid rounded shadow-sm" alt="${p.label}">
      <p class="text-center mt-1">${p.label}</p>
    </div>`
    )).join('');
}

document.addEventListener('DOMContentLoaded', loadGallery);