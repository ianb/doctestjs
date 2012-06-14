#!/usr/bin/env python
import os
import re


def replace_section(content, name, replacement):
    start_regex = re.compile(r'<!--\s*%s\s*-->' % name)
    end_regex = re.compile(r'<!--\s*/%s\s*-->' % name)
    start = start_regex.search(content)
    end = end_regex.search(content)
    assert start and end
    return content[:start.end()] + replacement + content[end.start():]


def retemplate(source_filename):
    with open(source_filename) as f:
        content = f.read()
    for name, filename in [
        ('HEADER', 'header.html'),
        ('FOOTER', 'footer.html'),
        ]:
        with open(os.path.join(os.path.dirname(__file__), filename)) as f:
            replacement = f.read()
        try:
            new_content = replace_section(content, name, replacement)
        except:
            print 'Error in file %s' % source_filename
            raise
        if new_content == content:
            print 'File %s up-to-date' % source_filename
            return
        print 'Rewriting %s' % source_filename
        with open(source_filename, 'w') as f:
            f.write(new_content)


if __name__ == '__main__':
    import sys
    files = sys.argv[1:]
    for file in files:
        retemplate(file)
