// Photo upload
const fileInput = document.getElementById('fileInput');
const nameInput = document.getElementById('nameInput');
const uploadBtn = document.getElementById('uploadBtn');
const gallery = document.getElementById('gallery');
let selectedFile, selectedName = '';

fileInput.onchange = () => { selectedFile = fileInput.files[0]; updateBtn(); };
nameInput.oninput = () => { selectedName = nameInput.value.trim(); updateBtn(); };

function updateBtn() { 
    uploadBtn.disabled = !selectedFile || !selectedName; 
}

uploadBtn.onclick = () => {
    if (!selectedFile || !selectedName) return;

    const form = new FormData();
    form.append('photo', selectedFile);
    form.append('name', selectedName);

    uploadFile('/api/upload', form, 'uploadProgressContainer', 'uploadProgressBar', async () => {
        selectedFile = null;
        selectedName = '';
        fileInput.value = '';
        nameInput.value = '';
        updateBtn();
        await loadGallery();
    });
};

// Generic file upload function
function uploadFile(url, formData, containerID, barID, onSuccess) {
    const container = document.getElementById(containerID);
    const bar = document.getElementById(barID);

    container.style.display = 'block';
    bar.style.width = '0%';
    bar.textContent = '0%';

    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);

    xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            bar.style.width = percent + '%';
            bar.textContent = percent + '%';
        }
    };

    xhr.onload = async () => {
        if (xhr.status === 200) {
            bar.style.width = '100%';
            bar.textContent = 'Upload complete!';
            if (onSuccess) await onSuccess();
            setTimeout(() => {
                container.style.display = 'none';
                bar.style.width = '0%';
                bar.textContent = '0%';
            }, 1500);
        } else {
            alert('Upload failed');
            container.style.display = 'none';
        }
    };

    xhr.onerror = () => {
        alert('Upload failed');
        container.style.display = 'none';
    };

    xhr.send(formData);
}

// Gallery functions
async function loadGallery() {
    const photos = await (await fetch('/api/photos')).json();
    gallery.innerHTML = '';
    
    photos.forEach(p => {
        const div = document.createElement('div');
        div.className = 'col-lg-4 col-md-6 col-12 mb-4 position-relative';
        div.id = p.filename;
        div.innerHTML = `
            <img src="${p.thumbUrl}" class="img-fluid rounded shadow-sm" alt="${p.label}"
                data-bs-toggle="modal" data-bs-target="#imageModal" data-large="${p.url}">
            <button class="btn btn-danger btn-sm position-absolute top-0 end-0 m-2 delete-btn">×</button>
            <p class="text-center mt-1 rename-label">${p.label}</p>
        `;

        // Delete handler
        div.querySelector('.delete-btn').onclick = async () => {
            if (!confirm('Delete this photo?')) return;
            await fetch(`/api/photo/${p.filename}`, { method: 'DELETE' });
            await loadGallery();
        };

        // Rename handler
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
                const order = Array.from(gallery.children).map(el => ({
                    filename: el.id,
                    label: el.id === p.filename ? newLabel : el.querySelector('.rename-label')?.textContent || ''
                }));

                await fetch('/api/order', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(order)
                });

                await loadGallery();
            };

            input.addEventListener('blur', commit);
            input.addEventListener('keydown', e => e.key === 'Enter' && commit());
        });

        gallery.appendChild(div);
    });

    // Modal setup
    const imageModal = document.getElementById('imageModal');
    imageModal.addEventListener('show.bs.modal', event => {
        document.getElementById('modalImage').src = event.relatedTarget.getAttribute('data-large');
    });

    // Drag-and-drop
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