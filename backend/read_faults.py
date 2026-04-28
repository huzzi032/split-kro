import codecs
try:
    with codecs.open('fault.log', 'r', 'utf-16le') as f:
        print(f.read().split("Traceback")[-1])
except Exception as e:
    print(e)
