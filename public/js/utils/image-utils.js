// js/utils/image-utils.js
export function resizeImage(file, callback) {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = function(e) {
        img.src = e.target.result;
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const MAX_SIZE = 150;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > MAX_SIZE) {
                    height *= MAX_SIZE / width;
                    width = MAX_SIZE;
                }
            } else {
                if (height > MAX_SIZE) {
                    width *= MAX_SIZE / height;
                    height = MAX_SIZE;
                }
            }

            canvas.width = MAX_SIZE;
            canvas.height = MAX_SIZE;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, MAX_SIZE, MAX_SIZE);
            ctx.drawImage(img, (MAX_SIZE - width) / 2, (MAX_SIZE - height) / 2, width, height);
            callback(canvas.toDataURL('image/jpeg'));
        };
    };
    reader.readAsDataURL(file);
}