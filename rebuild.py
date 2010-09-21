#!/usr/bin/env python

import os
import re

here = os.path.dirname(os.path.abspath(__file__))
os.chdir(here)

template = open('index_template.html').read()
pages = ['index.html', 'examples.html']
for name in pages:
    content = open('docs/' + name).read()
    match = re.search(r'<body.*?>', content, re.I)
    content = content[match.end():]
    match = re.search(r'</body>', content, re.I)
    content = content[:match.start()]
    page = template.replace('__BODY__', content)
    fp = open(name, 'w')
    fp.write(page)
    fp.close();
