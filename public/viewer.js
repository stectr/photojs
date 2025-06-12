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
    const imageModal = document.getElementById('imageModal');
    imageModal.addEventListener('show.bs.modal', event => {
        const thumb = event.relatedTarget;                      // the <img> that triggered it
        const fullUrl = thumb.getAttribute('data-large');       // your full-size URL
        document.getElementById('modalImage').src = fullUrl;    // swap into the modal <img>
    });
});
