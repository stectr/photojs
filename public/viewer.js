// public/viewer.js

async function loadGallery() {
    const photos = await (await fetch('/api/photos')).json();
    const gallery = document.getElementById('gallery');

    gallery.innerHTML = photos.map(p => `
    <div class="col-lg-4 col-md-6 col-12 mb-4">
      <img
        src="${p.thumbUrl}"
        class="img-fluid rounded shadow-sm"
        alt="${p.label}"
        data-bs-toggle="modal"
        data-bs-target="#imageModal"
        data-large="${p.url}"
      >
      <p class="text-center mt-1">${p.label}</p>
    </div>
  `).join('');
}

document.addEventListener('DOMContentLoaded', () => {
    loadGallery();

    // Modal handler: when the modal opens, grab the clicked thumbnail's data-large
    imageModal.addEventListener('show.bs.modal', event => {
        const thumb = event.relatedTarget;
        const fullUrl = thumb.getAttribute('data-large');
        const modalImage = document.getElementById('modalImage');
        modalImage.src = ''; // clear previous image immediately
        modalImage.src = `${fullUrl}?t=${Date.now()}`; // unique URL disables cache
    });
});
