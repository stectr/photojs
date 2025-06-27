// Handles upload, listing, drag-and-drop, delete, and inline rename

const fileInput = document.getElementById('fileInput');
const nameInput = document.getElementById('nameInput');
const uploadBtn = document.getElementById('uploadBtn');
const gallery = document.getElementById('gallery');
let selectedFile, selectedName = '';

fileInput.onchange = () => { selectedFile = fileInput.files[0]; updateBtn(); };
nameInput.oninput = () => { selectedName = nameInput.value.trim(); updateBtn(); };
function updateBtn() { uploadBtn.disabled = !selectedFile || !selectedName; }

uploadBtn.onclick = () => {
    if (!selectedFile || !selectedName) return;

    const form = new FormData();
    form.append('photo', selectedFile);
    form.append('name', selectedName);

    const progressContainer = document.getElementById('uploadProgressContainer');
    const progressBar = document.getElementById('uploadProgressBar');

    progressContainer.style.display = 'block';
    progressBar.style.width = '0%';
    progressBar.textContent = '0%';

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');

    xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            progressBar.style.width = percent + '%';
            progressBar.textContent = percent + '%';
        }
    };

    xhr.onload = async () => {
        if (xhr.status === 200) {
            progressBar.style.width = '100%';
            progressBar.textContent = 'Upload complete!';
            selectedFile = null;
            selectedName = '';
            fileInput.value = '';
            nameInput.value = '';
            updateBtn();
            await loadGallery();
            setTimeout(() => {
                progressContainer.style.display = 'none';
                progressBar.style.width = '0%';
                progressBar.textContent = '0%';
            }, 1500);
        } else {
            alert('Upload failed');
            progressContainer.style.display = 'none';
        }
    };

    xhr.onerror = () => {
        alert('Upload failed');
        progressContainer.style.display = 'none';
    };

    xhr.send(form);
};


async function loadGallery() {
    const photos = await (await fetch('/api/photos')).json();
    gallery.innerHTML = '';
    photos.forEach(p => {
        const div = document.createElement('div');
        div.className = 'col-lg-4 col-md-6 col-12 mb-4 position-relative';
        div.id = p.filename;
        div.innerHTML = `
          <img
            src="${p.thumbUrl}"
            class="img-fluid rounded shadow-sm"
            alt="${p.label}"
            data-bs-toggle="modal"
            data-bs-target="#imageModal"
            data-large="${p.url}"
          >
          <button class="btn btn-danger btn-sm position-absolute top-0 end-0 m-2 delete-btn">×</button>
          <p class="text-center mt-1 rename-label">${p.label}</p>
        `;

        // Delete
        div.querySelector('.delete-btn').onclick = async () => {
            if (!confirm('Delete this photo?')) return;
            await fetch(`/api/photo/${p.filename}`, { method: 'DELETE' });
            await loadGallery();
        };

        // Inline rename with forced reload after commit
        const labelEl = div.querySelector('.rename-label');
        labelEl.addEventListener('dblclick', () => {
            const input = document.createElement('input');
            input.type = 'text';
            input.value = labelEl.textContent;
            input.className = 'form-control text-center mt-1';
            labelEl.replaceWith(input);
            input.focus();
            input.select();

            const commit = async () => {
                const newLabel = input.value.trim() || p.filename;

                // Prepare order array with updated label
                const order = Array.from(gallery.children).map(el => ({
                    filename: el.id,
                    label: el.id === p.filename ? newLabel : el.querySelector('.rename-label')?.textContent || ''
                }));

                // Send update to server
                await fetch('/api/order', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(order)
                });

                // Reload entire gallery to reset handlers and update UI
                await loadGallery();
            };

            input.addEventListener('blur', commit);
            input.addEventListener('keydown', e => {
                if (e.key === 'Enter') commit();
            });
        });

        gallery.appendChild(div);
    });

    // Modal image setup
    const imageModal = document.getElementById('imageModal');
    imageModal.addEventListener('show.bs.modal', event => {
        const imgEl = event.relatedTarget;
        document.getElementById('modalImage').src = imgEl.getAttribute('data-large');
    });

    // Drag-and-drop reorder
    Sortable.create(gallery, {
        animation: 150,
        onEnd: async () => {
            const order = Array.from(gallery.children).map(el => ({
                filename: el.id,
                label: el.querySelector('.rename-label').textContent
            }));
            await fetch('/api/order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(order)
            });
        }
    });
}

document.addEventListener('DOMContentLoaded', loadGallery);
