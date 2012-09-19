function contentsOnLoad() {
    var dest = document.getElementById('contents');
    var toc = [document.createElement('ul')];
    dest.appendChild(toc[0]);
    var els = document.querySelectorAll('h3, h4, h5, h6');
    for (var i=0; i<els.length; i++) {
        var el = els[i];
        var elDepth = ['H3', 'H4', 'H5', 'H6'].indexOf(el.tagName);
        while (elDepth < toc.length-1) {
          toc.splice(toc.length-1, 1);
        }
        while (elDepth >= toc.length) {
          var ul = document.createElement('ul');
          var container = document.createElement('li');
          container.appendChild(ul);
          toc[toc.length-1].appendChild(container);
          toc.push(ul);
        }
        var name = 'header-'+(i+1);
        el.setAttribute('id', name);
        var li = document.createElement('li');
        var anchor = document.createElement('a');
        if (el.getAttribute('href')) {
          anchor.setAttribute('href', el.getAttribute('href'));
          el.style.display = 'none';
        } else {
          anchor.setAttribute('href', '#'+name);
        }
        li.appendChild(anchor);
        anchor.innerHTML = el.innerHTML;
        toc[toc.length-1].appendChild(li);
    }
    // Re-scroll:
    if (location.hash) {
      location.hash = location.hash;
    }
}

window.onload = contentsOnLoad;
