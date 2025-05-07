# Enhanced Post Generator Implementation

To implement image upload and better category management in your post generator, you would need to:

1. Add file upload functionality to the HTML:
```html
<div class="form-group">
  <label for="image-upload">Upload Images</label>
  <input type="file" id="image-upload" multiple accept="image/*">
  <div id="image-preview" class="image-preview-container"></div>
</div>
```

2. Add JavaScript to handle the uploads:
```javascript
document.getElementById('image-upload').addEventListener('change', function(e) {
  const files = e.target.files;
  const previewContainer = document.getElementById('image-preview');
  previewContainer.innerHTML = '';
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const reader = new FileReader();
    
    reader.onload = function(e) {
      const imgContainer = document.createElement('div');
      imgContainer.className = 'image-item';
      
      const img = document.createElement('img');
      img.src = e.target.result;
      img.className = 'preview-img';
      
      const insertBtn = document.createElement('button');
      insertBtn.textContent = 'Insert into post';
      insertBtn.className = 'insert-btn';
      insertBtn.addEventListener('click', function() {
        // Generate a safe filename
        const safeFilename = file.name.replace(/[^a-z0-9.]/gi, '-').toLowerCase();
        const postSlug = titleInput.value.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, '-');
        const imgPath = `/static/img/posts/${postSlug}/${safeFilename}`;
        
        // Insert markdown at cursor position
        const textarea = document.getElementById('content');
        const imageMarkdown = `\n\n![${file.name.split('.')[0]}](${imgPath})\n\n`;
        
        const cursorPos = textarea.selectionStart;
        const textBefore = textarea.value.substring(0, cursorPos);
        const textAfter = textarea.value.substring(cursorPos);
        
        textarea.value = textBefore + imageMarkdown + textAfter;
        updatePreview();
      });
      
      imgContainer.appendChild(img);
      imgContainer.appendChild(insertBtn);
      previewContainer.appendChild(imgContainer);
    };
    
    reader.readAsDataURL(file);
  }
});
```

3. Add server-side code to handle the actual file uploads when the post is generated.

This is just a starting point - a full implementation would require more extensive changes to your post generator.
