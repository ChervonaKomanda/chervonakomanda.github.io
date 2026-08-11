---
layout: page
title: Archive Index
permalink: /archives/
---

<div id="file-tree-container">
  <ul id="root-tree">Loading archives...</ul>
</div>

<script>
fetch('{{ "/filetree.json" | relative_url }}')
  .then(response => response.json())
  .then(files => {
    // Sort oldest to newest
    files.sort((a, b) => new Date(a.date) - new Date(b.date));

    const root = {};
    
    files.forEach(file => {
      // Split path to build nested object structure
      const parts = file.path.split('/');
      
      // Remove 'archives' prefix from tree so it starts directly with inner folders
      if (parts[0] === 'archives') {
        parts.shift();
      }
      
      // Filter out this index file itself so it doesn't show up in its own file tree
      if (parts.length === 0 || parts[0] === 'index.html' || parts[0] === 'index.md') return;

      let current = root;
      parts.forEach((part, index) => {
        if (!current[part]) {
          current[part] = (index === parts.length - 1) 
            ? { __file: file, __date: new Date(file.date) } 
            : { __date: new Date(file.date) };
        } else {
          const currentFileDate = new Date(file.date);
          if (currentFileDate < current[part].__date) {
            current[part].__date = currentFileDate;
          }
        }
        current = current[part];
      });
    });

    function createList(obj) {
      const ul = document.createElement('ul');
      
      const sortedKeys = Object.keys(obj)
        .filter(key => key !== '__file' && key !== '__date')
        .sort((a, b) => obj[a].__date - obj[b].__date);

      sortedKeys.forEach(key => {
        const li = document.createElement('li');
        
        if (obj[key].__file) {
          const a = document.createElement('a');
          a.href = obj[key].__file.url;
          a.textContent = obj[key].__file.title || key;
          li.appendChild(a);
        } else {
          li.textContent = key;
          li.classList.add('folder', 'closed'); 
          
          li.addEventListener('click', (e) => {
            e.stopPropagation();
            li.classList.toggle('closed');
          });
          li.appendChild(createList(obj[key]));
        }
        ul.appendChild(li);
      });
      return ul;
    }

    const container = document.getElementById('root-tree');
    container.innerHTML = '';
    container.appendChild(createList(root));
  });
</script>

<style>
  #file-tree-container ul { list-style-type: none; padding-left: 20px; margin: 5px 0; }
  #file-tree-container li { margin: 4px 0; position: relative; }
  #file-tree-container li.folder { cursor: pointer; font-weight: bold; user-select: none; }
  
  #file-tree-container li.folder::before { content: "📂 "; }
  #file-tree-container li.folder.closed::before { content: "📁 "; }
  #file-tree-container li.folder.closed > ul { display: none; }
  
  #file-tree-container li:not(.folder)::before { content: "📄 "; }
  #file-tree-container a { font-weight: normal; text-decoration: none; color: #0066cc; }
  #file-tree-container a:hover { text-decoration: underline; }
</style>
